import { CommandMetadata } from '../base/command.interface'

export interface ICommandMiddleware {
  name?: string
  
  /**
   * Executed before the command
   * Return false to block execution
   */
  before?(
    commandName: string,
    input: any,
    metadata: CommandMetadata
  ): Promise<boolean | void>
  
  /**
   * Executed after successful command execution
   */
  after?(
    commandName: string,
    input: any,
    output: any,
    metadata: CommandMetadata,
    duration: number
  ): Promise<void>
  
  /**
   * Executed on command error
   */
  onError?(
    commandName: string,
    input: any,
    error: Error,
    metadata: CommandMetadata
  ): Promise<void>
}