import { randomUUID } from 'crypto'
import { ICommand, CommandMetadata, CommandResult } from './command.interface'
import { createErrorResponse, createSuccessResponse, ActionResponse } from '@/lib/utils/form-responses'

export abstract class BaseCommand<TInput = any, TOutput = ActionResponse> 
  implements ICommand<TInput, TOutput> {
  
  abstract readonly name: string
  abstract readonly description: string
  
  protected executedAt?: Date
  protected input?: TInput
  protected output?: TOutput
  protected metadata?: CommandMetadata
  
  get canUndo(): boolean {
    return false // Override in subclasses if undoable
  }
  
  abstract execute(input: TInput, metadata?: CommandMetadata): Promise<TOutput>
  
  async validate(input: TInput): Promise<boolean> {
    return true // Override in subclasses for validation
  }
  
  async undo(): Promise<void> {
    if (!this.canUndo) {
      throw new Error(`Command ${this.name} cannot be undone`)
    }
    throw new Error(`Undo not implemented for ${this.name}`)
  }
  
  async redo(): Promise<void> {
    if (!this.canUndo) {
      throw new Error(`Command ${this.name} cannot be redone`)
    }
    if (!this.input) {
      throw new Error('No input available for redo')
    }
    this.output = await this.execute(this.input, this.metadata)
  }
  
  protected generateCommandId(): string {
    return randomUUID()
  }
  
  protected logExecution(input: TInput, metadata?: CommandMetadata): void {
    this.input = input
    this.metadata = metadata || {
      commandId: this.generateCommandId(),
      timestamp: new Date()
    }
    this.executedAt = new Date()
    
    console.log(`[Command] Executing ${this.name}`, {
      commandId: this.metadata.commandId,
      timestamp: this.metadata.timestamp
    })
  }
  
  protected logSuccess(output: TOutput): void {
    this.output = output
    console.log(`[Command] Success ${this.name}`, {
      commandId: this.metadata?.commandId,
      duration: this.executedAt ? Date.now() - this.executedAt.getTime() : 0
    })
  }
  
  protected logError(error: Error): void {
    console.error(`[Command] Error ${this.name}`, {
      commandId: this.metadata?.commandId,
      error: error.message,
      stack: error.stack
    })
  }
}