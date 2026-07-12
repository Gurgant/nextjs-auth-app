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
    value?: any,
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

/**
 * Missing required field error
 */
export class MissingRequiredFieldError extends BaseError {
  constructor(field: string | string[], context?: ErrorContext) {
    const fields = Array.isArray(field) ? field : [field];
    const message =
      fields.length > 1
        ? `Missing required fields: ${fields.join(", ")}`
        : `Missing required field: ${fields[0]}`;

    super(ErrorCode.MISSING_REQUIRED_FIELD, message, { fields }, context);
  }
}

/**
 * Invalid format error
 */
export class InvalidFormatError extends BaseError {
  constructor(
    field: string,
    expectedFormat: string,
    actualValue?: string,
    context?: ErrorContext,
  ) {
    super(
      ErrorCode.INVALID_FORMAT,
      `Invalid format for ${field}. Expected: ${expectedFormat}`,
      { field, expectedFormat, actualValue },
      context,
    );
  }
}

/**
 * Value out of range error
 */
export class ValueOutOfRangeError extends BaseError {
  constructor(
    field: string,
    min?: number | Date,
    max?: number | Date,
    actualValue?: number | Date,
    context?: ErrorContext,
  ) {
    let message = `Value for ${field} is out of range`;
    if (min !== undefined && max !== undefined) {
      message += ` (must be between ${min} and ${max})`;
    } else if (min !== undefined) {
      message += ` (must be at least ${min})`;
    } else if (max !== undefined) {
      message += ` (must be at most ${max})`;
    }

    super(
      ErrorCode.VALUE_OUT_OF_RANGE,
      message,
      { field, min, max, actualValue },
      context,
    );
  }
}

/**
 * Duplicate value error
 */
export class DuplicateValueError extends BaseError {
  constructor(field: string, value: any, context?: ErrorContext) {
    super(
      ErrorCode.DUPLICATE_VALUE,
      `Duplicate value for ${field}: ${value}`,
      { field, value },
      context,
    );
  }
}

/**
 * Schema validation error
 */
export class SchemaValidationError extends ValidationError {
  constructor(schema: z.ZodSchema, data: any, context?: ErrorContext) {
    const result = schema.safeParse(data);
    const errors = !result.success ? result.error : undefined;

    super("Schema validation failed", errors, context);
  }
}

/**
 * Field validation error
 */
export class FieldValidationError extends BaseError {
  readonly field: string;
  readonly validationRule: string;

  constructor(
    field: string,
    validationRule: string,
    message: string,
    actualValue?: any,
    context?: ErrorContext,
  ) {
    super(
      ErrorCode.VALIDATION_FAILED,
      message,
      { field, validationRule, actualValue },
      context,
    );

    this.field = field;
    this.validationRule = validationRule;
  }
}

/**
 * Create validation error from multiple field errors
 */
export class CompositeValidationError extends ValidationError {
  readonly fieldErrors: FieldValidationError[];

  constructor(fieldErrors: FieldValidationError[], context?: ErrorContext) {
    const errors: Record<string, string[]> = {};

    for (const error of fieldErrors) {
      if (!errors[error.field]) {
        errors[error.field] = [];
      }
      errors[error.field].push(error.message);
    }

    super("Multiple validation errors occurred", errors, context);

    this.fieldErrors = fieldErrors;
  }
}
