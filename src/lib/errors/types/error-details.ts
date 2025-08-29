/**
 * Structured error details types
 * This file provides type-safe interfaces for different kinds of error details
 */

/**
 * Base error details interface
 */
export interface BaseErrorDetails {
  [key: string]: unknown;
}

/**
 * Validation error details
 */
export interface ValidationErrorDetails extends BaseErrorDetails {
  field?: string;
  value?: string | number | boolean | null;
  expectedType?: string;
  constraint?: string;
}

/**
 * Duplicate value error details
 */
export interface DuplicateValueErrorDetails extends BaseErrorDetails {
  field: string;
  value: string | number | boolean;
  resourceType?: string;
}

/**
 * Invalid input error details
 */
export interface InvalidInputErrorDetails extends BaseErrorDetails {
  field: string;
  value?: unknown;
  expectedType?: string;
}

/**
 * Schema validation error details
 */
export interface SchemaValidationErrorDetails extends BaseErrorDetails {
  schema: string;
  errors: Array<{
    path: string;
    message: string;
    value?: unknown;
  }>;
}

/**
 * Authentication error details
 */
export interface AuthErrorDetails extends BaseErrorDetails {
  userId?: string;
  email?: string;
  provider?: string;
  reason?: string;
}

/**
 * Authorization error details
 */
export interface AuthorizationErrorDetails extends BaseErrorDetails {
  userId?: string;
  resource?: string;
  action?: string;
  requiredRole?: string;
  userRole?: string;
}

/**
 * Business logic error details
 */
export interface BusinessLogicErrorDetails extends BaseErrorDetails {
  resourceType?: string;
  resourceId?: string;
  constraint?: string;
  operation?: string;
}

/**
 * System error details
 */
export interface SystemErrorDetails extends BaseErrorDetails {
  service?: string;
  operation?: string;
  statusCode?: number;
  originalError?: string;
}

/**
 * Database error details
 */
export interface DatabaseErrorDetails extends BaseErrorDetails {
  operation?: string;
  table?: string;
  constraint?: string;
  code?: string;
}

/**
 * External service error details
 */
export interface ExternalServiceErrorDetails extends BaseErrorDetails {
  service: string;
  endpoint?: string;
  statusCode?: number;
  responseBody?: Record<string, unknown>;
  timeout?: boolean;
}

/**
 * Rate limiting error details
 */
export interface RateLimitErrorDetails extends BaseErrorDetails {
  limit: number;
  window: number;
  current: number;
  resetTime?: Date;
  identifier?: string;
}

/**
 * Union type of all error details
 */
export type ErrorDetails =
  | BaseErrorDetails
  | ValidationErrorDetails
  | DuplicateValueErrorDetails
  | InvalidInputErrorDetails
  | SchemaValidationErrorDetails
  | AuthErrorDetails
  | AuthorizationErrorDetails
  | BusinessLogicErrorDetails
  | SystemErrorDetails
  | DatabaseErrorDetails
  | ExternalServiceErrorDetails
  | RateLimitErrorDetails;

/**
 * Type guard functions for error details
 */
export function isValidationErrorDetails(
  details: unknown,
): details is ValidationErrorDetails {
  return (
    typeof details === "object" &&
    details !== null &&
    "field" in details &&
    typeof (details as ValidationErrorDetails).field === "string"
  );
}

export function isDuplicateValueErrorDetails(
  details: unknown,
): details is DuplicateValueErrorDetails {
  return (
    typeof details === "object" &&
    details !== null &&
    "field" in details &&
    "value" in details &&
    typeof (details as DuplicateValueErrorDetails).field === "string"
  );
}

export function isSchemaValidationErrorDetails(
  details: unknown,
): details is SchemaValidationErrorDetails {
  return (
    typeof details === "object" &&
    details !== null &&
    "schema" in details &&
    "errors" in details &&
    Array.isArray((details as SchemaValidationErrorDetails).errors)
  );
}

export function isAuthErrorDetails(
  details: unknown,
): details is AuthErrorDetails {
  return (
    typeof details === "object" &&
    details !== null &&
    ("userId" in details || "email" in details || "provider" in details)
  );
}

export function isSystemErrorDetails(
  details: unknown,
): details is SystemErrorDetails {
  return (
    typeof details === "object" &&
    details !== null &&
    ("service" in details || "operation" in details || "statusCode" in details)
  );
}
