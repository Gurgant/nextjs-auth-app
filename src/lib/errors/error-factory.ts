import { BaseError, ErrorContext } from './base/base-error'
import { ErrorCode } from './base/error-codes'
import * as AuthErrors from './domain/auth-errors'
import * as ValidationErrors from './domain/validation-errors'
import * as BusinessErrors from './domain/business-errors'
import * as SystemErrors from './domain/system-errors'
import { z } from 'zod'

/**
 * Error factory for creating domain-specific errors
 */
export class ErrorFactory {
  /**
   * Create authentication errors
   */
  static auth = {
    invalidCredentials: (context?: ErrorContext) => 
      new AuthErrors.InvalidCredentialsError(undefined, context),
    
    sessionExpired: (context?: ErrorContext) => 
      new AuthErrors.SessionExpiredError(undefined, context),
    
    accountLocked: (reason: string, lockedUntil?: Date, context?: ErrorContext) => 
      new AuthErrors.AccountLockedError(reason, lockedUntil, context),
    
    accountDisabled: (reason?: string, context?: ErrorContext) => 
      new AuthErrors.AccountDisabledError(reason, context),
    
    emailNotVerified: (email: string, context?: ErrorContext) => 
      new AuthErrors.EmailNotVerifiedError(email, context),
    
    twoFactorRequired: (method: 'totp' | 'sms' | 'email', context?: ErrorContext) => 
      new AuthErrors.TwoFactorRequiredError(method, context),
    
    twoFactorFailed: (attemptsRemaining?: number, context?: ErrorContext) => 
      new AuthErrors.TwoFactorFailedError(attemptsRemaining, context),
    
    unauthorized: (resource?: string, action?: string, context?: ErrorContext) => 
      new AuthErrors.AuthorizationError(undefined, resource, action, context),
    
    insufficientPermissions: (required: string[], userPerms?: string[], context?: ErrorContext) => 
      new AuthErrors.InsufficientPermissionsError(required, userPerms, context),
    
    resourceAccessDenied: (resource: string, resourceId?: string, context?: ErrorContext) => 
      new AuthErrors.ResourceAccessDeniedError(resource, resourceId, context)
  }
  
  /**
   * Create validation errors
   */
  static validation = {
    failed: (message?: string, errors?: Record<string, string | string[]>, context?: ErrorContext) => 
      new ValidationErrors.ValidationError(message, errors, context),
    
    fromZod: (zodError: z.ZodError, context?: ErrorContext) => 
      new ValidationErrors.ValidationError('Validation failed', zodError, context),
    
    invalidInput: (field: string, value?: any, expectedType?: string, context?: ErrorContext) => 
      new ValidationErrors.InvalidInputError(field, value, expectedType, context),
    
    missingField: (field: string | string[], context?: ErrorContext) => 
      new ValidationErrors.MissingRequiredFieldError(field, context),
    
    invalidFormat: (field: string, expectedFormat: string, actualValue?: string, context?: ErrorContext) => 
      new ValidationErrors.InvalidFormatError(field, expectedFormat, actualValue, context),
    
    outOfRange: (field: string, min?: number | Date, max?: number | Date, actualValue?: number | Date, context?: ErrorContext) => 
      new ValidationErrors.ValueOutOfRangeError(field, min, max, actualValue, context),
    
    duplicate: (field: string, value: any, context?: ErrorContext) => 
      new ValidationErrors.DuplicateValueError(field, value, context),
    
    schema: (schema: z.ZodSchema, data: any, context?: ErrorContext) => 
      new ValidationErrors.SchemaValidationError(schema, data, context),
    
    field: (field: string, rule: string, message: string, value?: any, context?: ErrorContext) => 
      new ValidationErrors.FieldValidationError(field, rule, message, value, context),
    
    composite: (fieldErrors: ValidationErrors.FieldValidationError[], context?: ErrorContext) => 
      new ValidationErrors.CompositeValidationError(fieldErrors, context)
  }
  
  /**
   * Create business logic errors
   */
  static business = {
    ruleViolation: (rule: string, message: string, details?: any, context?: ErrorContext) => 
      new BusinessErrors.BusinessRuleViolationError(rule, message, details, context),
    
    operationNotAllowed: (operation: string, reason: string, context?: ErrorContext) => 
      new BusinessErrors.OperationNotAllowedError(operation, reason, context),
    
    notFound: (resourceType: string, resourceId?: string | number, context?: ErrorContext) => 
      new BusinessErrors.ResourceNotFoundError(resourceType, resourceId, context),
    
    alreadyExists: (resourceType: string, identifier: Record<string, any>, context?: ErrorContext) => 
      new BusinessErrors.ResourceAlreadyExistsError(resourceType, identifier, context),
    
    concurrentModification: (resourceType: string, resourceId: string | number, expectedVersion?: number, actualVersion?: number, context?: ErrorContext) => 
      new BusinessErrors.ConcurrentModificationError(resourceType, resourceId, expectedVersion, actualVersion, context),
    
    quotaExceeded: (quotaType: string, limit: number, current: number, resetAt?: Date, context?: ErrorContext) => 
      new BusinessErrors.QuotaExceededError(quotaType, limit, current, resetAt, context),
    
    invalidStateTransition: (entityType: string, currentState: string, attemptedState: string, allowedStates?: string[], context?: ErrorContext) => 
      new BusinessErrors.InvalidStateTransitionError(entityType, currentState, attemptedState, allowedStates, context),
    
    invariantViolation: (invariant: string, message: string, context?: ErrorContext) => 
      new BusinessErrors.InvariantViolationError(invariant, message, context),
    
    preconditionFailed: (precondition: string, message: string, context?: ErrorContext) => 
      new BusinessErrors.PreconditionFailedError(precondition, message, context),
    
    postconditionFailed: (postcondition: string, message: string, context?: ErrorContext) => 
      new BusinessErrors.PostconditionFailedError(postcondition, message, context),
    
    dependency: (dependency: string, operation: string, reason: string, context?: ErrorContext) => 
      new BusinessErrors.DependencyError(dependency, operation, reason, context),
    
    workflow: (workflow: string, step: string, reason: string, context?: ErrorContext) => 
      new BusinessErrors.WorkflowError(workflow, step, reason, context)
  }
  
  /**
   * Create system errors
   */
  static system = {
    internal: (message?: string, cause?: Error, context?: ErrorContext) => 
      new SystemErrors.InternalError(message, cause, context),
    
    unavailable: (service: string, reason?: string, estimatedDowntime?: number, context?: ErrorContext) => 
      new SystemErrors.ServiceUnavailableError(service, reason, estimatedDowntime, context),
    
    database: (operation: string, message: string, cause?: Error, context?: ErrorContext) => 
      new SystemErrors.DatabaseError(operation, message, cause, context),
    
    network: (url: string, method: string, statusCode?: number, cause?: Error, context?: ErrorContext) => 
      new SystemErrors.NetworkError(url, method, statusCode, cause, context),
    
    timeout: (operation: string, timeoutMs: number, context?: ErrorContext) => 
      new SystemErrors.TimeoutError(operation, timeoutMs, context),
    
    configuration: (configKey: string, reason: string, context?: ErrorContext) => 
      new SystemErrors.ConfigurationError(configKey, reason, context),
    
    rateLimit: (limit: number, window: string, resetAt?: Date, context?: ErrorContext) => 
      new SystemErrors.RateLimitError(limit, window, resetAt, context),
    
    externalService: (service: string, operation: string, statusCode?: number, responseBody?: any, cause?: Error, context?: ErrorContext) => 
      new SystemErrors.ExternalServiceError(service, operation, statusCode, responseBody, cause, context),
    
    api: (endpoint: string, method: string, statusCode: number, responseBody?: any, context?: ErrorContext) => 
      new SystemErrors.ApiError(endpoint, method, statusCode, responseBody, context),
    
    webhookFailed: (url: string, event: string, attempts: number, lastError?: string, context?: ErrorContext) => 
      new SystemErrors.WebhookFailedError(url, event, attempts, lastError, context),
    
    emailFailed: (recipient: string, subject: string, reason?: string, context?: ErrorContext) => 
      new SystemErrors.EmailSendFailedError(recipient, subject, reason, context),
    
    smsFailed: (recipient: string, reason?: string, context?: ErrorContext) => 
      new SystemErrors.SmsSendFailedError(recipient, reason, context),
    
    circuitBreakerOpen: (service: string, failureCount: number, threshold: number, resetAfter: Date, context?: ErrorContext) => 
      new SystemErrors.CircuitBreakerOpenError(service, failureCount, threshold, resetAfter, context),
    
    resourceExhausted: (resource: string, limit: number, current: number, context?: ErrorContext) => 
      new SystemErrors.ResourceExhaustedError(resource, limit, current, context)
  }
  
  /**
   * Create error from error code
   */
  static fromCode(code: ErrorCode, message: string, details?: any, context?: ErrorContext): BaseError {
    // This is a fallback method - prefer using specific factory methods
    class GenericError extends BaseError {
      constructor() {
        super(code, message, details, context)
      }
    }
    return new GenericError()
  }
  
  /**
   * Wrap unknown error
   */
  static wrap(error: unknown, context?: ErrorContext): BaseError {
    if (error instanceof BaseError) {
      return error
    }
    
    if (error instanceof Error) {
      return new SystemErrors.InternalError(
        error.message,
        error,
        context
      )
    }
    
    return new SystemErrors.InternalError(
      'An unknown error occurred',
      undefined,
      { ...context, originalError: error }
    )
  }
  
  /**
   * Check if error is of specific type
   */
  static is<T extends BaseError>(
    error: unknown,
    ErrorClass: new (...args: any[]) => T
  ): error is T {
    return error instanceof ErrorClass
  }
  
  /**
   * Check if error has specific code
   */
  static hasCode(error: unknown, code: ErrorCode): boolean {
    return error instanceof BaseError && error.code === code
  }
}