import { BaseError, ErrorContext } from "../base/base-error";
import { ErrorCode } from "../base/error-codes";

/**
 * Operation not allowed error
 */
export class OperationNotAllowedError extends BaseError {
  constructor(operation: string, reason: string, context?: ErrorContext) {
    super(
      ErrorCode.OPERATION_NOT_ALLOWED,
      `Operation '${operation}' is not allowed: ${reason}`,
      { operation, reason },
      context,
    );
  }
}

/**
 * Resource not found error
 */
export class ResourceNotFoundError extends BaseError {
  constructor(
    resourceType: string,
    resourceId?: string | number,
    context?: ErrorContext,
  ) {
    const message = resourceId
      ? `${resourceType} with ID '${resourceId}' not found`
      : `${resourceType} not found`;

    super(
      ErrorCode.RESOURCE_NOT_FOUND,
      message,
      { resourceType, resourceId },
      context,
    );
  }
}

/**
 * Resource already exists error
 */
export class ResourceAlreadyExistsError extends BaseError {
  constructor(
    resourceType: string,
    identifier: Record<string, unknown>,
    context?: ErrorContext,
  ) {
    super(
      ErrorCode.RESOURCE_ALREADY_EXISTS,
      `${resourceType} already exists`,
      { resourceType, identifier },
      context,
    );
  }
}
