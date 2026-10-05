import { ICommandMiddleware } from "./middleware.interface";
import { CommandMetadata } from "../base/command.interface";
import { answerSaysSuccess } from "../base/outcome";
import { describeThrown } from "../base/thrown";

/**
 * Length of the JSON form of a command input, for the log line only.
 * 0 = the input has no JSON form (undefined, a function, a symbol);
 * undefined = it could not be measured (BigInt, circular reference).
 */
function serializedSize(input: unknown): number | undefined {
  try {
    return JSON.stringify(input)?.length ?? 0;
  } catch {
    return undefined;
  }
}

export class LoggingMiddleware implements ICommandMiddleware {
  name = "LoggingMiddleware";

  async before(
    commandName: string,
    input: unknown,
    metadata: CommandMetadata,
  ): Promise<void> {
    console.log(`[Command:${commandName}] Starting execution`, {
      commandId: metadata.commandId,
      userId: metadata.userId,
      timestamp: metadata.timestamp,
      inputSize: serializedSize(input),
    });
  }

  async after(
    commandName: string,
    input: unknown,
    output: unknown,
    metadata: CommandMetadata,
    duration: number,
  ): Promise<void> {
    // "Completed" for every command that returned: a refusal returns too, and
    // the `success` field says which it was.
    console.log(`[Command:${commandName}] Completed`, {
      commandId: metadata.commandId,
      userId: metadata.userId,
      duration: `${duration}ms`,
      success: answerSaysSuccess(output),
    });
  }

  // The bus hands over whatever was thrown, which need not be an Error.
  async onError(
    commandName: string,
    input: unknown,
    error: unknown,
    metadata: CommandMetadata,
  ): Promise<void> {
    const thrown = describeThrown(error);
    console.error(`[Command:${commandName}] Failed with error`, {
      commandId: metadata.commandId,
      userId: metadata.userId,
      error: thrown.message,
      stack: thrown.stack,
    });
  }
}
