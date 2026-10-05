import { BaseError, ErrorContext } from "./base/base-error";
import * as ValidationErrors from "./domain/validation-errors";
import * as BusinessErrors from "./domain/business-errors";
import * as SystemErrors from "./domain/system-errors";
import { z } from "zod";

/**
 * Error factory for creating domain-specific errors
 */
export class ErrorFactory {
  /**
   * Create validation errors
   */
  static validation = {
    fromZod: (zodError: z.ZodError, context?: ErrorContext) =>
      new ValidationErrors.ValidationError(
        "Validation failed",
        zodError,
        context,
      ),

    invalidInput: (
      field: string,
      value?: unknown,
      expectedType?: string,
      context?: ErrorContext,
    ) =>
      new ValidationErrors.InvalidInputError(
        field,
        value,
        expectedType,
        context,
      ),
  };

  /**
   * Create business logic errors
   */
  static business = {
    operationNotAllowed: (
      operation: string,
      reason: string,
      context?: ErrorContext,
    ) =>
      new BusinessErrors.OperationNotAllowedError(operation, reason, context),

    notFound: (
      resourceType: string,
      resourceId?: string | number,
      context?: ErrorContext,
    ) =>
      new BusinessErrors.ResourceNotFoundError(
        resourceType,
        resourceId,
        context,
      ),

    alreadyExists: (
      resourceType: string,
      identifier: Record<string, unknown>,
      context?: ErrorContext,
    ) =>
      new BusinessErrors.ResourceAlreadyExistsError(
        resourceType,
        identifier,
        context,
      ),
  };

  /**
   * Wrap unknown error
   */
  static wrap(error: unknown, context?: ErrorContext): BaseError {
    if (error instanceof BaseError) {
      return error;
    }

    if (error instanceof Error) {
      return new SystemErrors.InternalError(error.message, error, context);
    }

    return new SystemErrors.InternalError(
      "An unknown error occurred",
      undefined,
      { ...context, originalError: error },
    );
  }
}
