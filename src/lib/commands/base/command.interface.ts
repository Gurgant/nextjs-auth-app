import { ActionResponse } from "@/lib/utils/form-responses";

export interface CommandMetadata {
  commandId: string;
  userId?: string;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  locale?: string;
}

export interface ICommand<TInput = any, TOutput = any> {
  readonly name: string;
  readonly description: string;
  readonly canUndo: boolean;

  execute(input: TInput, metadata?: CommandMetadata): Promise<TOutput>;
  validate?(input: TInput): Promise<boolean>;
  undo?(): Promise<void>;
  redo?(): Promise<void>;
}

export interface ICommandHandler<TInput = any, TOutput = any> {
  handle(input: TInput, metadata?: CommandMetadata): Promise<TOutput>;
}

export interface CommandResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: CommandMetadata;
}

export interface ExecutedCommand {
  command: ICommand<any, any>;
  input: any;
  output: any;
  metadata: CommandMetadata;
  timestamp: Date;
  undoable: boolean;
}
