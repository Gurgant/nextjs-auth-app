import { randomUUID } from "crypto";
import { ICommand, CommandMetadata } from "./command.interface";
import { ActionResponse } from "@/lib/utils/form-responses";

/**
 * What a command answers when something unexpected fails inside it. The
 * exception itself is logged on the server and never sent to the client.
 */
export const COMMAND_FAILED_MESSAGE = "Something went wrong. Please try again.";

export abstract class BaseCommand<TInput = unknown, TOutput = ActionResponse>
  implements ICommand<TInput, TOutput>
{
  abstract readonly name: string;
  abstract readonly description: string;

  // One instance of each command serves every execution: only what the log
  // lines need is kept here, never the input (it can hold plain-text passwords).
  protected executedAt?: Date;
  protected metadata?: CommandMetadata;

  abstract execute(input: TInput, metadata?: CommandMetadata): Promise<TOutput>;

  async validate(_input: TInput): Promise<boolean> {
    return true; // Override in subclasses for validation
  }

  protected generateCommandId(): string {
    return randomUUID();
  }

  protected logExecution(metadata?: CommandMetadata): void {
    this.metadata = metadata || {
      commandId: this.generateCommandId(),
      timestamp: new Date(),
    };
    this.executedAt = new Date();

    if (process.env.NODE_ENV === "development") {
      console.log(`[Command] Executing ${this.name}`, {
        commandId: this.metadata.commandId,
        timestamp: this.metadata.timestamp,
      });
    }
  }

  protected logSuccess(): void {
    if (process.env.NODE_ENV === "development") {
      console.log(`[Command] Success ${this.name}`, {
        commandId: this.metadata?.commandId,
        duration: this.executedAt ? Date.now() - this.executedAt.getTime() : 0,
      });
    }
  }

  protected logError(error: Error): void {
    console.error(`[Command] Error ${this.name}`, {
      commandId: this.metadata?.commandId,
      error: error.message,
      stack: error.stack,
    });
  }
}
