import { BaseEvent } from "../base/event.base";
import { EventMetadata } from "../base/event.interface";

// System event payloads
export interface CommandExecutedPayload {
  commandName: string;
  commandId: string;
  input: any;
  output: any;
  success: boolean;
  duration: number;
  executedAt: Date;
}

export interface CommandFailedPayload {
  commandName: string;
  commandId: string;
  error: string;
  errorStack?: string;
  input: any;
  failedAt: Date;
}

export interface CommandUndonePayload {
  commandName: string;
  commandId: string;
  undoneAt: Date;
}

export interface DatabaseErrorPayload {
  operation: string;
  table?: string;
  error: string;
  query?: string;
  occurredAt: Date;
}

export interface ApplicationStartedPayload {
  version: string;
  environment: string;
  startedAt: Date;
  config?: Record<string, any>;
}

export interface ApplicationStoppedPayload {
  reason: string;
  stoppedAt: Date;
}

export interface HealthCheckPayload {
  status: "healthy" | "degraded" | "unhealthy";
  checks: {
    database: boolean;
    redis?: boolean;
    api?: boolean;
    [key: string]: boolean | undefined;
  };
  checkedAt: Date;
}

export interface ErrorOccurredPayload {
  errorType: string;
  message: string;
  stack?: string;
  context?: Record<string, any>;
  severity: "low" | "medium" | "high" | "critical";
  occurredAt: Date;
}

export interface PerformanceMetricPayload {
  metric: string;
  value: number;
  unit: string;
  tags?: Record<string, string>;
  measuredAt: Date;
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

export class CommandUndoneEvent extends BaseEvent<CommandUndonePayload> {
  readonly type = "system.command_undone";

  constructor(
    payload: CommandUndonePayload,
    metadata?: Partial<EventMetadata>,
  ) {
    super(payload, metadata);
  }
}

export class DatabaseErrorEvent extends BaseEvent<DatabaseErrorPayload> {
  readonly type = "system.database_error";

  constructor(
    payload: DatabaseErrorPayload,
    metadata?: Partial<EventMetadata>,
  ) {
    super(payload, metadata);
  }
}

export class ApplicationStartedEvent extends BaseEvent<ApplicationStartedPayload> {
  readonly type = "system.application_started";

  constructor(
    payload: ApplicationStartedPayload,
    metadata?: Partial<EventMetadata>,
  ) {
    super(payload, metadata);
  }
}

export class ApplicationStoppedEvent extends BaseEvent<ApplicationStoppedPayload> {
  readonly type = "system.application_stopped";

  constructor(
    payload: ApplicationStoppedPayload,
    metadata?: Partial<EventMetadata>,
  ) {
    super(payload, metadata);
  }
}

export class HealthCheckEvent extends BaseEvent<HealthCheckPayload> {
  readonly type = "system.health_check";

  constructor(payload: HealthCheckPayload, metadata?: Partial<EventMetadata>) {
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

export class PerformanceMetricEvent extends BaseEvent<PerformanceMetricPayload> {
  readonly type = "system.performance_metric";

  constructor(
    payload: PerformanceMetricPayload,
    metadata?: Partial<EventMetadata>,
  ) {
    super(payload, metadata);
  }
}

// Export all system events
export const SystemEvents = {
  CommandExecutedEvent,
  CommandFailedEvent,
  CommandUndoneEvent,
  DatabaseErrorEvent,
  ApplicationStartedEvent,
  ApplicationStoppedEvent,
  HealthCheckEvent,
  ErrorOccurredEvent,
  PerformanceMetricEvent,
} as const;
