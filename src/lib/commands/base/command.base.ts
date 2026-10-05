import { randomUUID } from "crypto";
import { ICommand, CommandMetadata } from "./command.interface";
import { ActionResponse } from "@/lib/utils/form-responses";

/**
 * What a command answers when something unexpected fails inside it: the
 * message `Errors.somethingWentWrong` in the locale of its input, and this
 * text without a locale or a translation. The exception itself is logged on
 * the server and never sent to the client.
 */
export const COMMAND_FAILED_MESSAGE = "Something went wrong. Please try again.";

/** What the log lines of one run need: its id and when it started. */
interface CommandRun {
  readonly commandId: string;
  readonly startedAt: number;
}

export abstract class BaseCommand<TInput = unknown, TOutput = ActionResponse>
  implements ICommand<TInput, TOutput>
{
  abstract readonly name: string;
  abstract readonly description: string;

  // One instance of each command serves every execution, and two executions
  // can overlap: nothing of a run is kept on it. Not the input (it can hold
  // plain-text passwords), not the metadata object (it holds the client IP
  // and the User-Agent of the request), and not the id or the start time of
  // a run either: logExecution hands those to the run, which passes them to
  // logSuccess or logError.

  abstract execute(input: TInput, metadata?: CommandMetadata): Promise<TOutput>;

  async validate(_input: TInput): Promise<boolean> {
    return true; // Override in subclasses for validation
  }

  protected generateCommandId(): string {
    return randomUUID();
  }

  protected logExecution(metadata?: CommandMetadata): CommandRun {
    const { commandId, timestamp } = metadata || {
      commandId: this.generateCommandId(),
      timestamp: new Date(),
    };

    if (process.env.NODE_ENV === "development") {
      console.log(`[Command] Executing ${this.name}`, {
        commandId,
        timestamp,
      });
    }

    return { commandId, startedAt: Date.now() };
  }

  protected logSuccess(run: CommandRun): void {
    if (process.env.NODE_ENV === "development") {
      console.log(`[Command] Success ${this.name}`, {
        commandId: run.commandId,
        duration: Date.now() - run.startedAt,
      });
    }
  }

  protected logError(run: CommandRun, error: Error): void {
    console.error(`[Command] Error ${this.name}`, {
      commandId: run.commandId,
      error: error.message,
      stack: error.stack,
    });
  }
}
