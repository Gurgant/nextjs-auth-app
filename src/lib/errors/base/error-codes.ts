/**
 * Error codes for consistent error identification
 */
export enum ErrorCode {
  // Validation errors (1200-1299)
  VALIDATION_FAILED = "VAL_1200",
  INVALID_INPUT = "VAL_1201",

  // Business logic errors (1300-1399)
  OPERATION_NOT_ALLOWED = "BIZ_1301",
  RESOURCE_NOT_FOUND = "BIZ_1302",
  RESOURCE_ALREADY_EXISTS = "BIZ_1303",

  // System errors (1500-1599)
  INTERNAL_ERROR = "SYS_1500",
}

/**
 * Error categories for grouping errors
 */
export enum ErrorCategory {
  VALIDATION = "validation",
  BUSINESS_LOGIC = "business_logic",
  SYSTEM = "system",
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = "low",
  HIGH = "high",
}

/**
 * HTTP status codes mapping
 */
export const ErrorStatusMap: Record<ErrorCode, number> = {
  // 400 Bad Request
  [ErrorCode.VALIDATION_FAILED]: 400,
  [ErrorCode.INVALID_INPUT]: 400,

  // 404 Not Found
  [ErrorCode.RESOURCE_NOT_FOUND]: 404,

  // 409 Conflict
  [ErrorCode.RESOURCE_ALREADY_EXISTS]: 409,

  // 422 Unprocessable Entity
  [ErrorCode.OPERATION_NOT_ALLOWED]: 422,

  // 500 Internal Server Error
  [ErrorCode.INTERNAL_ERROR]: 500,
};

/**
 * Get error category from error code
 */
export function getErrorCategory(code: ErrorCode): ErrorCategory {
  // No default: the compiler reports a code that has no category here
  switch (code) {
    case ErrorCode.VALIDATION_FAILED:
    case ErrorCode.INVALID_INPUT:
      return ErrorCategory.VALIDATION;
    case ErrorCode.OPERATION_NOT_ALLOWED:
    case ErrorCode.RESOURCE_NOT_FOUND:
    case ErrorCode.RESOURCE_ALREADY_EXISTS:
      return ErrorCategory.BUSINESS_LOGIC;
    case ErrorCode.INTERNAL_ERROR:
      return ErrorCategory.SYSTEM;
  }
}

/**
 * Determine error severity based on code
 */
export function getErrorSeverity(code: ErrorCode): ErrorSeverity {
  // High severity
  if (code === ErrorCode.INTERNAL_ERROR) {
    return ErrorSeverity.HIGH;
  }

  // Low severity
  return ErrorSeverity.LOW;
}
