import { CommandMetadata } from "../base/command.interface";

export interface ICommandMiddleware {
  name?: string;

  /**
   * Executed before the command
   * Return false to block execution
   */
  before?(
    commandName: string,
    input: unknown,
    metadata: CommandMetadata,
  ): Promise<boolean | void>;

  /**
   * Executed after successful command execution
   */
  after?(
    commandName: string,
    input: unknown,
    output: unknown,
    metadata: CommandMetadata,
    duration: number,
  ): Promise<void>;

  /**
   * Executed on command error. `error` is whatever was thrown, which need
   * not be an Error (see base/thrown.ts).
   */
  onError?(
    commandName: string,
    input: unknown,
    error: unknown,
    metadata: CommandMetadata,
  ): Promise<void>;
}
