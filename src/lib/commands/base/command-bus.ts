import { ICommand, CommandMetadata, ExecutedCommand } from './command.interface'
import { CommandHistory } from '../history/command-history'
import { ICommandMiddleware } from '../middleware/middleware.interface'
import { randomUUID } from 'crypto'
import { eventBus } from '@/lib/events'
import { CommandExecutedEvent, CommandFailedEvent, CommandUndoneEvent } from '@/lib/events/domain/system.events'

export interface CommandBusOptions {
  enableHistory?: boolean
  maxHistorySize?: number
  enableLogging?: boolean
}

export class CommandBus {
  private handlers = new Map<string, ICommand<any, any>>()
  private middleware: ICommandMiddleware[] = []
  private history: CommandHistory
  private options: CommandBusOptions
  
  constructor(options: CommandBusOptions = {}) {
    this.options = {
      enableHistory: true,
      maxHistorySize: 100,
      enableLogging: true,
      ...options
    }
    
    this.history = new CommandHistory(this.options.maxHistorySize || 100)
  }
  
  /**
   * Register a command handler
   */
  register<TCommand extends ICommand<any, any>>(
    CommandClass: new () => TCommand
  ): void {
    const instance = new CommandClass()
    this.handlers.set(CommandClass.name, instance)
    
    if (this.options.enableLogging) {
      console.log(`[CommandBus] Registered command: ${CommandClass.name}`)
    }
  }
  
  /**
   * Register multiple command handlers
   */
  registerMany(commandClasses: Array<new () => ICommand<any, any>>): void {
    commandClasses.forEach(CommandClass => this.register(CommandClass))
  }
  
  /**
   * Add middleware to the pipeline
   */
  use(middleware: ICommandMiddleware): CommandBus {
    this.middleware.push(middleware)
    return this
  }
  
  /**
   * Execute a command
   */
  async execute<TInput, TOutput>(
    CommandClass: new () => ICommand<TInput, TOutput>,
    input: TInput,
    metadata?: Partial<CommandMetadata>
  ): Promise<TOutput> {
    const commandName = CommandClass.name
    const handler = this.handlers.get(commandName)
    
    if (!handler) {
      throw new Error(`No handler registered for command: ${commandName}`)
    }
    
    // Build metadata
    const fullMetadata: CommandMetadata = {
      commandId: randomUUID(),
      timestamp: new Date(),
      ...metadata
    }
    
    // Execute before middleware
    for (const mw of this.middleware) {
      if (mw.before) {
        const shouldContinue = await mw.before(commandName, input, fullMetadata)
        if (shouldContinue === false) {
          throw new Error(`Command execution blocked by middleware: ${commandName}`)
        }
      }
    }
    
    try {
      // Validate input if validation is implemented
      if (handler.validate) {
        const isValid = await handler.validate(input)
        if (!isValid) {
          throw new Error(`Validation failed for command: ${commandName}`)
        }
      }
      
      // Execute command
      const startTime = Date.now()
      const output = await handler.execute(input, fullMetadata)
      const duration = Date.now() - startTime
      
      // Store in history if enabled and command is undoable
      if (this.options.enableHistory && handler.canUndo) {
        const executedCommand: ExecutedCommand = {
          command: handler,
          input,
          output,
          metadata: fullMetadata,
          timestamp: new Date(),
          undoable: handler.canUndo
        }
        this.history.add(executedCommand)
      }
      
      // Execute after middleware
      for (const mw of this.middleware) {
        if (mw.after) {
          await mw.after(commandName, input, output, fullMetadata, duration)
        }
      }
      
      // Emit command executed event
      await eventBus.publish(new CommandExecutedEvent({
        commandName,
        commandId: fullMetadata.commandId,
        input: this.sanitizeInput(input),
        output: this.sanitizeOutput(output),
        success: true,
        duration,
        executedAt: new Date()
      }, fullMetadata))
      
      if (this.options.enableLogging) {
        console.log(`[CommandBus] Executed ${commandName} in ${duration}ms`)
      }
      
      return output
    } catch (error) {
      // Execute error middleware
      for (const mw of this.middleware) {
        if (mw.onError) {
          await mw.onError(commandName, input, error as Error, fullMetadata)
        }
      }
      
      // Emit command failed event
      await eventBus.publish(new CommandFailedEvent({
        commandName,
        commandId: fullMetadata.commandId,
        error: (error as Error).message,
        errorStack: (error as Error).stack,
        input: this.sanitizeInput(input),
        failedAt: new Date()
      }, fullMetadata))
      
      if (this.options.enableLogging) {
        console.error(`[CommandBus] Error executing ${commandName}:`, error)
      }
      
      throw error
    }
  }
  
  /**
   * Undo the last undoable command
   */
  async undo(): Promise<void> {
    if (!this.options.enableHistory) {
      throw new Error('Command history is disabled')
    }
    
    const lastCommand = this.history.getLastUndoable()
    if (!lastCommand) {
      throw new Error('No undoable commands in history')
    }
    
    if (lastCommand.command.undo) {
      await lastCommand.command.undo()
    } else {
      throw new Error(`Command ${lastCommand.command.name} does not implement undo`)
    }
    this.history.moveToRedoStack(lastCommand)
    
    // Emit command undone event
    await eventBus.publish(new CommandUndoneEvent({
      commandName: lastCommand.command.name,
      commandId: lastCommand.metadata.commandId,
      undoneAt: new Date()
    }, lastCommand.metadata))
    
    if (this.options.enableLogging) {
      console.log(`[CommandBus] Undid command: ${lastCommand.command.name}`)
    }
  }
  
  /**
   * Redo the last undone command
   */
  async redo(): Promise<void> {
    if (!this.options.enableHistory) {
      throw new Error('Command history is disabled')
    }
    
    const commandToRedo = this.history.getLastRedoable()
    if (!commandToRedo) {
      throw new Error('No commands to redo')
    }
    
    if (commandToRedo.command.redo) {
      await commandToRedo.command.redo()
    } else {
      throw new Error(`Command ${commandToRedo.command.name} does not implement redo`)
    }
    this.history.moveToUndoStack(commandToRedo)
    
    if (this.options.enableLogging) {
      console.log(`[CommandBus] Redid command: ${commandToRedo.command.name}`)
    }
  }
  
  /**
   * Get command history
   */
  getHistory(): ExecutedCommand[] {
    return this.history.getAll()
  }
  
  /**
   * Clear command history
   */
  clearHistory(): void {
    this.history.clear()
  }
  
  /**
   * Check if a command is registered
   */
  hasCommand(CommandClass: new () => ICommand<any, any>): boolean {
    return this.handlers.has(CommandClass.name)
  }
  
  /**
   * Get registered command names
   */
  getRegisteredCommands(): string[] {
    return Array.from(this.handlers.keys())
  }
  
  /**
   * Sanitize sensitive input data for events
   */
  private sanitizeInput(input: any): any {
    if (!input) return input
    
    const sanitized = { ...input }
    const sensitiveFields = ['password', 'confirmPassword', 'currentPassword', 'newPassword', 'token', 'secret']
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]'
      }
    })
    
    return sanitized
  }
  
  /**
   * Sanitize sensitive output data for events
   */
  private sanitizeOutput(output: any): any {
    if (!output) return output
    
    const sanitized = { ...output }
    
    if (sanitized.token) {
      sanitized.token = '[REDACTED]'
    }
    if (sanitized.data?.token) {
      sanitized.data.token = '[REDACTED]'
    }
    
    return sanitized
  }
}