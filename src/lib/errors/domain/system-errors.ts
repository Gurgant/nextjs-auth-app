import { BaseError, ErrorContext } from '../base/base-error'
import { ErrorCode } from '../base/error-codes'

/**
 * Internal system error
 */
export class InternalError extends BaseError {
  constructor(
    message: string = 'An internal error occurred',
    cause?: Error,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.INTERNAL_ERROR,
      message,
      { originalError: cause?.message },
      context,
      cause
    )
  }
}

/**
 * Service unavailable error
 */
export class ServiceUnavailableError extends BaseError {
  constructor(
    service: string,
    reason?: string,
    estimatedDowntime?: number,
    context?: ErrorContext
  ) {
    const message = reason
      ? `${service} is unavailable: ${reason}`
      : `${service} is temporarily unavailable`
    
    super(
      ErrorCode.SERVICE_UNAVAILABLE,
      message,
      { service, reason, estimatedDowntime },
      context
    )
  }
}

/**
 * Database error
 */
export class DatabaseError extends BaseError {
  constructor(
    operation: string,
    message: string,
    cause?: Error,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.DATABASE_ERROR,
      `Database ${operation} failed: ${message}`,
      { operation, originalError: cause?.message },
      context,
      cause
    )
  }
}

/**
 * Network error
 */
export class NetworkError extends BaseError {
  constructor(
    url: string,
    method: string,
    statusCode?: number,
    cause?: Error,
    context?: ErrorContext
  ) {
    const message = statusCode
      ? `Network request failed with status ${statusCode}`
      : 'Network request failed'
    
    super(
      ErrorCode.NETWORK_ERROR,
      message,
      { url, method, statusCode, originalError: cause?.message },
      context,
      cause
    )
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends BaseError {
  constructor(
    operation: string,
    timeoutMs: number,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.TIMEOUT,
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      { operation, timeoutMs },
      context
    )
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends BaseError {
  constructor(
    configKey: string,
    reason: string,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.CONFIGURATION_ERROR,
      `Configuration error for '${configKey}': ${reason}`,
      { configKey, reason },
      context
    )
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends BaseError {
  constructor(
    limit: number,
    window: string,
    resetAt?: Date,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.RATE_LIMIT_EXCEEDED,
      `Rate limit exceeded: ${limit} requests per ${window}`,
      { limit, window, resetAt },
      context
    )
  }
}

/**
 * External service error
 */
export class ExternalServiceError extends BaseError {
  constructor(
    service: string,
    operation: string,
    statusCode?: number,
    responseBody?: any,
    cause?: Error,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      `External service '${service}' failed during ${operation}`,
      { 
        service, 
        operation, 
        statusCode, 
        responseBody,
        originalError: cause?.message 
      },
      context,
      cause
    )
  }
}

/**
 * API error
 */
export class ApiError extends BaseError {
  constructor(
    endpoint: string,
    method: string,
    statusCode: number,
    responseBody?: any,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.API_ERROR,
      `API request to ${method} ${endpoint} failed with status ${statusCode}`,
      { endpoint, method, statusCode, responseBody },
      context
    )
  }
}

/**
 * Webhook failed error
 */
export class WebhookFailedError extends BaseError {
  constructor(
    url: string,
    event: string,
    attempts: number,
    lastError?: string,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.WEBHOOK_FAILED,
      `Webhook to ${url} failed after ${attempts} attempts`,
      { url, event, attempts, lastError },
      context
    )
  }
}

/**
 * Email send failed error
 */
export class EmailSendFailedError extends BaseError {
  constructor(
    recipient: string,
    subject: string,
    reason?: string,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.EMAIL_SEND_FAILED,
      `Failed to send email to ${recipient}`,
      { recipient, subject, reason },
      context
    )
  }
}

/**
 * SMS send failed error
 */
export class SmsSendFailedError extends BaseError {
  constructor(
    recipient: string,
    reason?: string,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.SMS_SEND_FAILED,
      `Failed to send SMS to ${recipient}`,
      { recipient, reason },
      context
    )
  }
}

/**
 * Circuit breaker open error
 */
export class CircuitBreakerOpenError extends BaseError {
  constructor(
    service: string,
    failureCount: number,
    threshold: number,
    resetAfter: Date,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.SERVICE_UNAVAILABLE,
      `Circuit breaker is open for ${service}`,
      { 
        service, 
        failureCount, 
        threshold, 
        resetAfter 
      },
      context
    )
  }
}

/**
 * Resource exhausted error
 */
export class ResourceExhaustedError extends BaseError {
  constructor(
    resource: string,
    limit: number,
    current: number,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.QUOTA_EXCEEDED,
      `Resource '${resource}' exhausted. Current: ${current}/${limit}`,
      { resource, limit, current },
      context
    )
  }
}