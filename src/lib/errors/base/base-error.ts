import { randomUUID } from "crypto";
import {
  ErrorCode,
  ErrorCategory,
  ErrorSeverity,
  ErrorStatusMap,
  getErrorCategory,
  getErrorSeverity,
} from "./error-codes";
import { eventBus } from "@/lib/events";
import { ErrorOccurredEvent } from "@/lib/events/domain/system.events";

export interface ErrorContext {
  [key: string]: unknown;
  userId?: string;
  correlationId?: string;
  timestamp?: Date;
}

export abstract class BaseError extends Error {
  readonly id: string;
  readonly code: ErrorCode;
  readonly category: ErrorCategory;
  readonly severity: ErrorSeverity;
  readonly statusCode: number;
  readonly timestamp: Date;
  readonly details?: import("../types/error-details").ErrorDetails;
  readonly context?: ErrorContext;
  readonly cause?: Error;

  constructor(
    code: ErrorCode,
    message: string,
    details?: import("../types/error-details").ErrorDetails,
    context?: ErrorContext,
    cause?: Error,
  ) {
    super(message);

    this.name = this.constructor.name;
    this.id = randomUUID();
    this.code = code;
    this.category = getErrorCategory(code);
    this.severity = getErrorSeverity(code);
    this.statusCode = ErrorStatusMap[code];
    this.timestamp = new Date();
    this.details = details;
    this.context = {
      ...context,
      timestamp: this.timestamp,
    };
    this.cause = cause;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);

    // Emit error event for monitoring
    this.emitErrorEvent();
  }

  /**
   * Convert error to JSON representation
   */
  toJSON(): object {
    return {
      id: this.id,
      name: this.name,
      code: this.code,
      category: this.category,
      severity: this.severity,
      statusCode: this.statusCode,
      message: this.message,
      details: this.details,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(_locale: string = "en"): string {
    // Override in subclasses for i18n support
    return this.message;
  }

  /**
   * Emit error event for monitoring and logging
   */
  private async emitErrorEvent(): Promise<void> {
    try {
      await eventBus.publish(
        new ErrorOccurredEvent(
          {
            errorType: this.name,
            message: this.message,
            stack: this.stack,
            context: {
              ...this.context,
              code: this.code,
              category: this.category,
              details: this.details,
            },
            severity: this.severity,
            occurredAt: this.timestamp,
          },
          {
            userId: this.context?.userId,
            correlationId: this.context?.correlationId,
          },
        ),
      );
    } catch (error) {
      // Don't throw if event emission fails
      console.error("Failed to emit error event:", error);
    }
  }

  /**
   * Log error with appropriate severity
   */
  log(): void {
    const logData = {
      id: this.id,
      code: this.code,
      category: this.category,
      severity: this.severity,
      message: this.message,
      details: this.details,
      context: this.context,
    };

    switch (this.severity) {
      case ErrorSeverity.HIGH:
        console.error(
          `[${this.severity.toUpperCase()}] ${this.name}:`,
          logData,
        );
        break;
      default:
        console.log(`[${this.severity.toUpperCase()}] ${this.name}:`, logData);
    }
  }
}
