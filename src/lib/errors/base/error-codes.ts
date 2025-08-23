/**
 * Error codes for consistent error identification
 */
export enum ErrorCode {
  // Authentication errors (1000-1099)
  AUTHENTICATION_FAILED = "AUTH_1000",
  INVALID_CREDENTIALS = "AUTH_1001",
  SESSION_EXPIRED = "AUTH_1002",
  ACCOUNT_LOCKED = "AUTH_1003",
  ACCOUNT_DISABLED = "AUTH_1004",
  EMAIL_NOT_VERIFIED = "AUTH_1005",
  TWO_FACTOR_REQUIRED = "AUTH_1006",
  TWO_FACTOR_FAILED = "AUTH_1007",

  // Authorization errors (1100-1199)
  UNAUTHORIZED = "AUTHZ_1100",
  FORBIDDEN = "AUTHZ_1101",
  INSUFFICIENT_PERMISSIONS = "AUTHZ_1102",
  RESOURCE_ACCESS_DENIED = "AUTHZ_1103",

  // Validation errors (1200-1299)
  VALIDATION_FAILED = "VAL_1200",
  INVALID_INPUT = "VAL_1201",
  MISSING_REQUIRED_FIELD = "VAL_1202",
  INVALID_FORMAT = "VAL_1203",
  VALUE_OUT_OF_RANGE = "VAL_1204",
  DUPLICATE_VALUE = "VAL_1205",

  // Business logic errors (1300-1399)
  BUSINESS_RULE_VIOLATION = "BIZ_1300",
  OPERATION_NOT_ALLOWED = "BIZ_1301",
  RESOURCE_NOT_FOUND = "BIZ_1302",
  RESOURCE_ALREADY_EXISTS = "BIZ_1303",
  CONCURRENT_MODIFICATION = "BIZ_1304",
  QUOTA_EXCEEDED = "BIZ_1305",

  // Rate limiting errors (1400-1499)
  RATE_LIMIT_EXCEEDED = "RATE_1400",
  TOO_MANY_REQUESTS = "RATE_1401",
  THROTTLED = "RATE_1402",

  // System errors (1500-1599)
  INTERNAL_ERROR = "SYS_1500",
  SERVICE_UNAVAILABLE = "SYS_1501",
  DATABASE_ERROR = "SYS_1502",
  NETWORK_ERROR = "SYS_1503",
  TIMEOUT = "SYS_1504",
  CONFIGURATION_ERROR = "SYS_1505",

  // Integration errors (1600-1699)
  EXTERNAL_SERVICE_ERROR = "INT_1600",
  API_ERROR = "INT_1601",
  WEBHOOK_FAILED = "INT_1602",
  EMAIL_SEND_FAILED = "INT_1603",
  SMS_SEND_FAILED = "INT_1604",

  // Unknown error
  UNKNOWN = "UNKNOWN_9999",
}

/**
 * Error categories for grouping errors
 */
export enum ErrorCategory {
  AUTHENTICATION = "authentication",
  AUTHORIZATION = "authorization",
  VALIDATION = "validation",
  BUSINESS_LOGIC = "business_logic",
  RATE_LIMITING = "rate_limiting",
  SYSTEM = "system",
  INTEGRATION = "integration",
  UNKNOWN = "unknown",
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

/**
 * HTTP status codes mapping
 */
export const ErrorStatusMap: Record<ErrorCode, number> = {
  // 400 Bad Request
  [ErrorCode.VALIDATION_FAILED]: 400,
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.MISSING_REQUIRED_FIELD]: 400,
  [ErrorCode.INVALID_FORMAT]: 400,
  [ErrorCode.VALUE_OUT_OF_RANGE]: 400,

  // 401 Unauthorized
  [ErrorCode.AUTHENTICATION_FAILED]: 401,
  [ErrorCode.INVALID_CREDENTIALS]: 401,
  [ErrorCode.SESSION_EXPIRED]: 401,
  [ErrorCode.EMAIL_NOT_VERIFIED]: 401,
  [ErrorCode.TWO_FACTOR_REQUIRED]: 401,
  [ErrorCode.TWO_FACTOR_FAILED]: 401,
  [ErrorCode.UNAUTHORIZED]: 401,

  // 403 Forbidden
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: 403,
  [ErrorCode.RESOURCE_ACCESS_DENIED]: 403,
  [ErrorCode.ACCOUNT_LOCKED]: 403,
  [ErrorCode.ACCOUNT_DISABLED]: 403,

  // 404 Not Found
  [ErrorCode.RESOURCE_NOT_FOUND]: 404,

  // 409 Conflict
  [ErrorCode.DUPLICATE_VALUE]: 409,
  [ErrorCode.RESOURCE_ALREADY_EXISTS]: 409,
  [ErrorCode.CONCURRENT_MODIFICATION]: 409,

  // 422 Unprocessable Entity
  [ErrorCode.BUSINESS_RULE_VIOLATION]: 422,
  [ErrorCode.OPERATION_NOT_ALLOWED]: 422,

  // 429 Too Many Requests
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorCode.TOO_MANY_REQUESTS]: 429,
  [ErrorCode.THROTTLED]: 429,
  [ErrorCode.QUOTA_EXCEEDED]: 429,

  // 500 Internal Server Error
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.DATABASE_ERROR]: 500,
  [ErrorCode.CONFIGURATION_ERROR]: 500,
  [ErrorCode.UNKNOWN]: 500,

  // 502 Bad Gateway
  [ErrorCode.EXTERNAL_SERVICE_ERROR]: 502,
  [ErrorCode.API_ERROR]: 502,

  // 503 Service Unavailable
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,

  // 504 Gateway Timeout
  [ErrorCode.TIMEOUT]: 504,
  [ErrorCode.NETWORK_ERROR]: 504,

  // Email/SMS failures
  [ErrorCode.EMAIL_SEND_FAILED]: 500,
  [ErrorCode.SMS_SEND_FAILED]: 500,
  [ErrorCode.WEBHOOK_FAILED]: 500,
};

/**
 * Get error category from error code
 */
export function getErrorCategory(code: ErrorCode): ErrorCategory {
  const prefix = code.split("_")[0];

  switch (prefix) {
    case "AUTH":
      return ErrorCategory.AUTHENTICATION;
    case "AUTHZ":
      return ErrorCategory.AUTHORIZATION;
    case "VAL":
      return ErrorCategory.VALIDATION;
    case "BIZ":
      return ErrorCategory.BUSINESS_LOGIC;
    case "RATE":
      return ErrorCategory.RATE_LIMITING;
    case "SYS":
      return ErrorCategory.SYSTEM;
    case "INT":
      return ErrorCategory.INTEGRATION;
    default:
      return ErrorCategory.UNKNOWN;
  }
}

/**
 * Determine error severity based on code
 */
export function getErrorSeverity(code: ErrorCode): ErrorSeverity {
  // Critical errors
  if (
    [
      ErrorCode.DATABASE_ERROR,
      ErrorCode.SERVICE_UNAVAILABLE,
      ErrorCode.CONFIGURATION_ERROR,
    ].includes(code)
  ) {
    return ErrorSeverity.CRITICAL;
  }

  // High severity
  if (
    [
      ErrorCode.INTERNAL_ERROR,
      ErrorCode.ACCOUNT_LOCKED,
      ErrorCode.EXTERNAL_SERVICE_ERROR,
    ].includes(code)
  ) {
    return ErrorSeverity.HIGH;
  }

  // Medium severity
  if (
    [
      ErrorCode.AUTHENTICATION_FAILED,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      ErrorCode.BUSINESS_RULE_VIOLATION,
    ].includes(code)
  ) {
    return ErrorSeverity.MEDIUM;
  }

  // Low severity
  return ErrorSeverity.LOW;
}
