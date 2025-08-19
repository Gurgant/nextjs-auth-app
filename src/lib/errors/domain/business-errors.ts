import { BaseError, ErrorContext } from '../base/base-error'
import { ErrorCode } from '../base/error-codes'

/**
 * Business rule violation error
 */
export class BusinessRuleViolationError extends BaseError {
  constructor(
    rule: string,
    message: string,
    details?: any,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.BUSINESS_RULE_VIOLATION,
      message,
      { rule, ...details },
      context
    )
  }
}

/**
 * Operation not allowed error
 */
export class OperationNotAllowedError extends BaseError {
  constructor(
    operation: string,
    reason: string,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.OPERATION_NOT_ALLOWED,
      `Operation '${operation}' is not allowed: ${reason}`,
      { operation, reason },
      context
    )
  }
}

/**
 * Resource not found error
 */
export class ResourceNotFoundError extends BaseError {
  constructor(
    resourceType: string,
    resourceId?: string | number,
    context?: ErrorContext
  ) {
    const message = resourceId
      ? `${resourceType} with ID '${resourceId}' not found`
      : `${resourceType} not found`
    
    super(
      ErrorCode.RESOURCE_NOT_FOUND,
      message,
      { resourceType, resourceId },
      context
    )
  }
}

/**
 * Resource already exists error
 */
export class ResourceAlreadyExistsError extends BaseError {
  constructor(
    resourceType: string,
    identifier: Record<string, any>,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.RESOURCE_ALREADY_EXISTS,
      `${resourceType} already exists`,
      { resourceType, identifier },
      context
    )
  }
}

/**
 * Concurrent modification error
 */
export class ConcurrentModificationError extends BaseError {
  constructor(
    resourceType: string,
    resourceId: string | number,
    expectedVersion?: number,
    actualVersion?: number,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.CONCURRENT_MODIFICATION,
      `${resourceType} has been modified by another process`,
      { 
        resourceType, 
        resourceId, 
        expectedVersion, 
        actualVersion 
      },
      context
    )
  }
}

/**
 * Quota exceeded error
 */
export class QuotaExceededError extends BaseError {
  constructor(
    quotaType: string,
    limit: number,
    current: number,
    resetAt?: Date,
    context?: ErrorContext
  ) {
    const message = `${quotaType} quota exceeded. Limit: ${limit}, Current: ${current}`
    
    super(
      ErrorCode.QUOTA_EXCEEDED,
      message,
      { 
        quotaType, 
        limit, 
        current, 
        resetAt 
      },
      context
    )
  }
}

/**
 * State transition error
 */
export class InvalidStateTransitionError extends BusinessRuleViolationError {
  constructor(
    entityType: string,
    currentState: string,
    attemptedState: string,
    allowedStates?: string[],
    context?: ErrorContext
  ) {
    super(
      'state_transition',
      `Cannot transition ${entityType} from '${currentState}' to '${attemptedState}'`,
      { 
        entityType,
        currentState, 
        attemptedState, 
        allowedStates 
      },
      context
    )
  }
}

/**
 * Invariant violation error
 */
export class InvariantViolationError extends BusinessRuleViolationError {
  constructor(
    invariant: string,
    message: string,
    context?: ErrorContext
  ) {
    super(
      'invariant_violation',
      message,
      { invariant },
      context
    )
  }
}

/**
 * Precondition failed error
 */
export class PreconditionFailedError extends BusinessRuleViolationError {
  constructor(
    precondition: string,
    message: string,
    context?: ErrorContext
  ) {
    super(
      'precondition_failed',
      message,
      { precondition },
      context
    )
  }
}

/**
 * Postcondition failed error
 */
export class PostconditionFailedError extends BusinessRuleViolationError {
  constructor(
    postcondition: string,
    message: string,
    context?: ErrorContext
  ) {
    super(
      'postcondition_failed',
      message,
      { postcondition },
      context
    )
  }
}

/**
 * Dependency error
 */
export class DependencyError extends BaseError {
  constructor(
    dependency: string,
    operation: string,
    reason: string,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.OPERATION_NOT_ALLOWED,
      `Cannot ${operation} due to dependency on ${dependency}: ${reason}`,
      { dependency, operation, reason },
      context
    )
  }
}

/**
 * Workflow error
 */
export class WorkflowError extends BusinessRuleViolationError {
  constructor(
    workflow: string,
    step: string,
    reason: string,
    context?: ErrorContext
  ) {
    super(
      'workflow_violation',
      `Workflow '${workflow}' failed at step '${step}': ${reason}`,
      { workflow, step, reason },
      context
    )
  }
}