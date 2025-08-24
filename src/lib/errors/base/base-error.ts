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
  [key: string]: any;
  userId?: string;
  requestId?: string;
  correlationId?: string;
  timestamp?: Date;
  path?: string;
  method?: string;
}

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  details?: any;
  context?: ErrorContext;
  cause?: Error;
  stack?: string;
}

export abstract class BaseError extends Error {
  readonly id: string;
  readonly code: ErrorCode;
  readonly category: ErrorCategory;
  readonly severity: ErrorSeverity;
  readonly statusCode: number;
  readonly timestamp: Date;
  readonly details?: any;
  readonly context?: ErrorContext;
  readonly cause?: Error;

  constructor(
    code: ErrorCode,
    message: string,
    details?: any,
    context?: ErrorContext,
    cause?: Error,
  ) {
    super(message);

    this.name = this.constructor.name;
    this.id = randomUUID();
    this.code = code;
    this.category = getErrorCategory(code);
    this.severity = getErrorSeverity(code);
    this.statusCode = ErrorStatusMap[code] || 500;
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
  getUserMessage(locale: string = "en"): string {
    // Override in subclasses for i18n support
    return this.message;
  }

  /**
   * Get detailed error information for debugging
   */
  getDebugInfo(): object {
    return {
      ...this.toJSON(),
      cause: this.cause?.message,
      causeStack: this.cause?.stack,
    };
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    // Network and timeout errors are typically retryable
    return [
      ErrorCode.NETWORK_ERROR,
      ErrorCode.TIMEOUT,
      ErrorCode.SERVICE_UNAVAILABLE,
      ErrorCode.RATE_LIMIT_EXCEEDED,
    ].includes(this.code);
  }

  /**
   * Get suggested action for the error
   */
  getSuggestedAction(): string {
    switch (this.code) {
      case ErrorCode.INVALID_CREDENTIALS:
        return "Please check your email and password and try again.";
      case ErrorCode.SESSION_EXPIRED:
        return "Your session has expired. Please log in again.";
      case ErrorCode.ACCOUNT_LOCKED:
        return "Your account has been locked. Please contact support.";
      case ErrorCode.EMAIL_NOT_VERIFIED:
        return "Please verify your email address to continue.";
      case ErrorCode.RATE_LIMIT_EXCEEDED:
        return "Too many attempts. Please wait a moment and try again.";
      case ErrorCode.SERVICE_UNAVAILABLE:
        return "Service is temporarily unavailable. Please try again later.";
      case ErrorCode.VALIDATION_FAILED:
        return "Please check your input and try again.";
      default:
        return "An error occurred. Please try again or contact support if the problem persists.";
    }
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
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        console.error(
          `[${this.severity.toUpperCase()}] ${this.name}:`,
          logData,
        );
        break;
      case ErrorSeverity.MEDIUM:
        console.warn(`[${this.severity.toUpperCase()}] ${this.name}:`, logData);
        break;
      default:
        console.log(`[${this.severity.toUpperCase()}] ${this.name}:`, logData);
    }
  }

  /**
   * Create error response for API
   */
  toResponse(): {
    error: {
      id: string;
      code: string;
      message: string;
      details?: any;
      suggestedAction?: string;
    };
  } {
    return {
      error: {
        id: this.id,
        code: this.code,
        message: this.getUserMessage(),
        details: this.details,
        suggestedAction: this.getSuggestedAction(),
      },
    };
  }
}
