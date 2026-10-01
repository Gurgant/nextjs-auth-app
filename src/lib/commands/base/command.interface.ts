export interface CommandMetadata {
  commandId: string;
  userId?: string;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  locale?: string;
}

export interface ICommand<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly canUndo: boolean;

  execute(input: TInput, metadata?: CommandMetadata): Promise<TOutput>;
  validate?(input: TInput): Promise<boolean>;
  undo?(): Promise<void>;
  redo?(): Promise<void>;
}

export interface ICommandHandler<TInput = unknown, TOutput = unknown> {
  handle(input: TInput, metadata?: CommandMetadata): Promise<TOutput>;
}

export interface CommandResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: CommandMetadata;
}

export interface ExecutedCommand {
  command: ICommand<unknown, unknown>;
  input: unknown;
  output: unknown;
  metadata: CommandMetadata;
  timestamp: Date;
  undoable: boolean;
}
