import { ICommandMiddleware } from "./middleware.interface";
import { CommandMetadata } from "../base/command.interface";

export class LoggingMiddleware implements ICommandMiddleware {
  name = "LoggingMiddleware";

  async before(
    commandName: string,
    input: any,
    metadata: CommandMetadata,
  ): Promise<void> {
    console.log(`[Command:${commandName}] Starting execution`, {
      commandId: metadata.commandId,
      userId: metadata.userId,
      timestamp: metadata.timestamp,
      inputSize: JSON.stringify(input).length,
    });
  }

  async after(
    commandName: string,
    input: any,
    output: any,
    metadata: CommandMetadata,
    duration: number,
  ): Promise<void> {
    console.log(`[Command:${commandName}] Completed successfully`, {
      commandId: metadata.commandId,
      userId: metadata.userId,
      duration: `${duration}ms`,
      success: output?.success !== false,
    });
  }

  async onError(
    commandName: string,
    input: any,
    error: Error,
    metadata: CommandMetadata,
  ): Promise<void> {
    console.error(`[Command:${commandName}] Failed with error`, {
      commandId: metadata.commandId,
      userId: metadata.userId,
      error: error.message,
      stack: error.stack,
    });
  }
}
