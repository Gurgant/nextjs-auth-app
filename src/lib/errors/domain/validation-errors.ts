import { BaseError, ErrorContext } from "../base/base-error";
import { ErrorCode } from "../base/error-codes";
import { z } from "zod";

/**
 * Validation error - thrown when input validation fails
 */
export class ValidationError extends BaseError {
  constructor(
    message: string = "Validation failed",
    errors?: Record<string, string | string[]> | z.ZodError,
    context?: ErrorContext,
  ) {
    const details =
      errors instanceof z.ZodError
        ? ValidationError.formatZodErrors(errors)
        : errors;

    super(ErrorCode.VALIDATION_FAILED, message, details, context);
  }

  /**
   * Format Zod errors into a readable format
   */
  static formatZodErrors(zodError: z.ZodError): Record<string, string[]> {
    const errors: Record<string, string[]> = {};

    for (const issue of zodError.issues) {
      const path = issue.path.join(".");
      if (!errors[path]) {
        errors[path] = [];
      }
      errors[path].push(issue.message);
    }

    return errors;
  }
}

/**
 * Invalid input error
 */
export class InvalidInputError extends BaseError {
  constructor(
    field: string,
    value?: unknown,
    expectedType?: string,
    context?: ErrorContext,
  ) {
    super(
      ErrorCode.INVALID_INPUT,
      `Invalid input for field: ${field}`,
      { field, value, expectedType },
      context,
    );
  }
}
