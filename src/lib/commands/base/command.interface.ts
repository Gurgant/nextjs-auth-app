export interface CommandMetadata {
  commandId: string;
  userId?: string;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  locale?: string;
}

export interface ICommand<TInput = unknown, TOutput = unknown> {
  /**
   * Stable, readable name of the command. The bus uses it for middleware,
   * audit entries, events and logs: unlike the class identifier, it survives
   * minification.
   */
  readonly name: string;
  readonly description: string;

  execute(input: TInput, metadata?: CommandMetadata): Promise<TOutput>;
  validate?(input: TInput): Promise<boolean>;
}
