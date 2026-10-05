import { ErrorContext } from "./base/base-error";
import { ErrorFactory } from "./error-factory";

/**
 * Fluent builder for creating errors with context
 */
export class ErrorBuilder {
  private context: ErrorContext = {};

  /**
   * Set user ID in error context
   */
  withUserId(userId: string): this {
    this.context.userId = userId;
    return this;
  }

  /**
   * Set correlation ID in error context
   */
  withCorrelationId(correlationId: string): this {
    this.context.correlationId = correlationId;
    return this;
  }

  /**
   * Build validation error
   */
  validation = {
    invalidInput: (field: string, value?: unknown, expectedType?: string) =>
      ErrorFactory.validation.invalidInput(
        field,
        value,
        expectedType,
        this.context,
      ),
  };

  /**
   * Build business error
   */
  business = {
    operationNotAllowed: (operation: string, reason: string) =>
      ErrorFactory.business.operationNotAllowed(
        operation,
        reason,
        this.context,
      ),

    alreadyExists: (
      resourceType: string,
      identifier: Record<string, unknown>,
    ) =>
      ErrorFactory.business.alreadyExists(
        resourceType,
        identifier,
        this.context,
      ),
  };
}

/**
 * Create a new error builder
 */
export function createError(): ErrorBuilder {
  return new ErrorBuilder();
}
