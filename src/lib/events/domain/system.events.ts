import { BaseEvent } from "../base/event.base";
import { EventMetadata } from "../base/event.interface";

// System event payloads
export interface CommandExecutedPayload {
  commandName: string;
  commandId: string;
  input: unknown;
  output: unknown;
  success: boolean;
  duration: number;
  executedAt: Date;
}

export interface CommandFailedPayload {
  commandName: string;
  commandId: string;
  error: string;
  errorStack?: string;
  input: unknown;
  failedAt: Date;
}

export interface ErrorOccurredPayload {
  errorType: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  severity: "low" | "medium" | "high" | "critical";
  occurredAt: Date;
}

// System event classes
export class CommandExecutedEvent extends BaseEvent<CommandExecutedPayload> {
  readonly type = "system.command_executed";

  constructor(
    payload: CommandExecutedPayload,
    metadata?: Partial<EventMetadata>,
  ) {
    super(payload, metadata);
  }
}

export class CommandFailedEvent extends BaseEvent<CommandFailedPayload> {
  readonly type = "system.command_failed";

  constructor(
    payload: CommandFailedPayload,
    metadata?: Partial<EventMetadata>,
  ) {
    super(payload, metadata);
  }
}

export class ErrorOccurredEvent extends BaseEvent<ErrorOccurredPayload> {
  readonly type = "system.error_occurred";

  constructor(
    payload: ErrorOccurredPayload,
    metadata?: Partial<EventMetadata>,
  ) {
    super(payload, metadata);
  }
}
