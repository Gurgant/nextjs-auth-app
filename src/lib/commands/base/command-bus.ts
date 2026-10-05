import { ICommand, CommandMetadata } from "./command.interface";
import { sanitizeCommandInput, sanitizeCommandOutput } from "./sanitize";
import { answerSaysSuccess } from "./outcome";
import { describeThrown } from "./thrown";
import { ICommandMiddleware } from "../middleware/middleware.interface";
import { randomUUID } from "crypto";
import { eventBus } from "@/lib/events";
import {
  CommandExecutedEvent,
  CommandFailedEvent,
} from "@/lib/events/domain/system.events";

export interface CommandBusOptions {
  enableLogging?: boolean;
}

type CommandConstructor = new () => ICommand<unknown, unknown>;

export class CommandBus {
  // Keyed by the class itself: a class identifier is renamed by the production
  // minifier, and two classes can end up with the same one.
  private handlers = new Map<CommandConstructor, ICommand<unknown, unknown>>();
  private middleware: ICommandMiddleware[] = [];
  private options: CommandBusOptions;

  constructor(options: CommandBusOptions = {}) {
    this.options = {
      enableLogging: true,
      ...options,
    };
  }

  /**
   * Register a command handler
   */
  register<TCommand extends ICommand<unknown, unknown>>(
    CommandClass: new () => TCommand,
  ): void {
    const instance = new CommandClass();
    this.handlers.set(CommandClass, instance);

    if (this.options.enableLogging) {
      console.log(`[CommandBus] Registered command: ${instance.name}`);
    }
  }

  /**
   * Register multiple command handlers
   */
  registerMany(commandClasses: CommandConstructor[]): void {
    commandClasses.forEach((CommandClass) => this.register(CommandClass));
  }

  /**
   * Add middleware to the pipeline
   */
  use(middleware: ICommandMiddleware): CommandBus {
    this.middleware.push(middleware);
    return this;
  }

  /**
   * Execute a command
   */
  async execute<TInput, TOutput>(
    CommandClass: new () => ICommand<TInput, TOutput>,
    input: TInput,
    metadata?: Partial<CommandMetadata>,
  ): Promise<TOutput> {
    const handler = this.handlers.get(CommandClass) as
      | ICommand<TInput, TOutput>
      | undefined;

    if (!handler) {
      throw new Error(
        `No handler registered for command: ${CommandClass.name}`,
      );
    }

    // The command's own `name`, not the class identifier (see `handlers`).
    const commandName = handler.name;

    // Build metadata
    const fullMetadata: CommandMetadata = {
      commandId: randomUUID(),
      timestamp: new Date(),
      ...metadata,
    };

    // Execute before middleware
    for (const mw of this.middleware) {
      if (mw.before) {
        const shouldContinue = await mw.before(
          commandName,
          input,
          fullMetadata,
        );
        if (shouldContinue === false) {
          throw new Error(
            `Command execution blocked by middleware: ${commandName}`,
          );
        }
      }
    }

    try {
      // Validate input if validation is implemented
      if (handler.validate) {
        const isValid = await handler.validate(input);
        if (!isValid) {
          throw new Error(`Validation failed for command: ${commandName}`);
        }
      }

      // Execute command
      const startTime = Date.now();
      const output = await handler.execute(input, fullMetadata);
      const duration = Date.now() - startTime;

      // Execute after middleware
      for (const mw of this.middleware) {
        if (mw.after) {
          await mw.after(commandName, input, output, fullMetadata, duration);
        }
      }

      // Emit command executed event
      await eventBus.publish(
        new CommandExecutedEvent(
          {
            commandName,
            commandId: fullMetadata.commandId,
            input: sanitizeCommandInput(input),
            output: sanitizeCommandOutput(output),
            success: answerSaysSuccess(output),
            duration,
            executedAt: new Date(),
          },
          fullMetadata,
        ),
      );

      if (this.options.enableLogging) {
        console.log(`[CommandBus] Executed ${commandName} in ${duration}ms`);
      }

      return output;
    } catch (error) {
      // Execute error middleware
      for (const mw of this.middleware) {
        if (mw.onError) {
          await mw.onError(commandName, input, error as Error, fullMetadata);
        }
      }

      // Emit command failed event. What was caught need not be an Error.
      const thrown = describeThrown(error);
      await eventBus.publish(
        new CommandFailedEvent(
          {
            commandName,
            commandId: fullMetadata.commandId,
            error: thrown.message,
            errorStack: thrown.stack,
            input: sanitizeCommandInput(input),
            failedAt: new Date(),
          },
          fullMetadata,
        ),
      );

      if (this.options.enableLogging) {
        console.error(`[CommandBus] Error executing ${commandName}:`, error);
      }

      throw error;
    }
  }

  /**
   * Check if a command is registered
   */
  hasCommand(CommandClass: CommandConstructor): boolean {
    return this.handlers.has(CommandClass);
  }

  /**
   * Get registered command names
   */
  getRegisteredCommands(): string[] {
    return Array.from(this.handlers.values(), (handler) => handler.name);
  }
}
