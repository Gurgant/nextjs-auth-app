/**
 * Type definitions for Prisma errors
 * Provides type safety for Prisma error handling
 */

/**
 * Base Prisma error interface
 */
export interface PrismaErrorBase {
  name: string;
  code: string;
  message: string;
  clientVersion: string;
  meta?: {
    target?: string[];
    field_name?: string;
    table?: string;
    column?: string;
    constraint?: string;
    database_error?: string;
    [key: string]: unknown;
  };
}

/**
 * Prisma Client Known Request Error (P2xxx codes)
 */
export interface PrismaClientKnownRequestError extends PrismaErrorBase {
  code:
    | "P2000" // The provided value for the column is too long
    | "P2001" // The record searched for in the where condition does not exist
    | "P2002" // Unique constraint failed
    | "P2003" // Foreign key constraint failed
    | "P2004" // A constraint failed on the database
    | "P2005" // The value stored in the database for the field is invalid
    | "P2006" // The provided value for the field is not valid
    | "P2007" // Data validation error
    | "P2008" // Failed to parse the query
    | "P2009" // Failed to validate the query
    | "P2010" // Raw query failed
    | "P2011" // Null constraint violation
    | "P2012" // Missing a required value
    | "P2013" // Missing the required argument
    | "P2014" // The change you are trying to make would violate the required relation
    | "P2015" // A related record could not be found
    | "P2016" // Query interpretation error
    | "P2017" // The records for relation are not connected
    | "P2018" // The required connected records were not found
    | "P2019" // Input error
    | "P2020" // Value out of range for the type
    | "P2021" // The table does not exist in the current database
    | "P2022" // The column does not exist in the current database
    | "P2023" // Inconsistent column data
    | "P2024" // Timed out fetching a new connection from the connection pool
    | "P2025" // An operation failed because it depends on one or more records that were required but not found
    | "P2026" // The current database provider doesn't support a feature that the query used
    | "P2027" // Multiple errors occurred on the database during query execution
    | "P2028" // Transaction API error
    | string; // Allow for future error codes
}

/**
 * Prisma Client Unknown Request Error
 */
export interface PrismaClientUnknownRequestError extends PrismaErrorBase {
  code: "P2999" | string;
}

/**
 * Prisma Client Rust Panic Error
 */
export interface PrismaClientRustPanicError extends PrismaErrorBase {
  code: "P1000" | string;
}

/**
 * Prisma Client Initialization Error
 */
export interface PrismaClientInitializationError extends PrismaErrorBase {
  code:
    | "P1000" // Authentication failed against database server
    | "P1001" // Can't reach database server
    | "P1002" // The database server was reached but timed out
    | "P1003" // Database does not exist
    | "P1008" // Operations timed out
    | "P1009" // Database already exists
    | "P1010" // User access denied
    | "P1011" // Error opening a TLS connection
    | "P1012" // Schema parsing error
    | "P1013" // The provided database string is invalid
    | "P1014" // The underlying kind for model does not exist
    | "P1015" // Your Prisma schema is using features that are not supported
    | "P1016" // Your raw query had an incorrect number of parameters
    | "P1017" // Server has closed the connection
    | string;
  errorCode?: string;
}

/**
 * Prisma Client Validation Error
 */
export interface PrismaClientValidationError extends PrismaErrorBase {
  code: "P2000" | string;
}

/**
 * Union of all Prisma error types
 */
export type PrismaError =
  | PrismaClientKnownRequestError
  | PrismaClientUnknownRequestError
  | PrismaClientRustPanicError
  | PrismaClientInitializationError
  | PrismaClientValidationError;

/**
 * Type guard to check if error is a Prisma error
 */
export function isPrismaError(error: unknown): error is PrismaError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as PrismaError).code === "string" &&
    (error as PrismaError).code.startsWith("P")
  );
}

/**
 * Type guard for specific Prisma error types
 */
export function isPrismaClientKnownRequestError(
  error: unknown,
): error is PrismaClientKnownRequestError {
  return isPrismaError(error) && error.code.startsWith("P2");
}

export function isPrismaClientInitializationError(
  error: unknown,
): error is PrismaClientInitializationError {
  return isPrismaError(error) && error.code.startsWith("P1");
}

/**
 * Helper to get error details for specific Prisma error codes
 */
export function getPrismaErrorDetails(error: PrismaError): {
  type: string;
  description: string;
  isRecoverable: boolean;
} {
  const errorMap: Record<
    string,
    { type: string; description: string; isRecoverable: boolean }
  > = {
    P2002: {
      type: "UNIQUE_CONSTRAINT_VIOLATION",
      description: "Unique constraint failed",
      isRecoverable: true,
    },
    P2003: {
      type: "FOREIGN_KEY_CONSTRAINT_VIOLATION",
      description: "Foreign key constraint failed",
      isRecoverable: true,
    },
    P2025: {
      type: "RECORD_NOT_FOUND",
      description: "Record not found",
      isRecoverable: true,
    },
    P1001: {
      type: "CONNECTION_ERROR",
      description: "Can't reach database server",
      isRecoverable: false,
    },
    P1008: {
      type: "TIMEOUT_ERROR",
      description: "Operations timed out",
      isRecoverable: true,
    },
  };

  return (
    errorMap[error.code] || {
      type: "UNKNOWN_ERROR",
      description: error.message,
      isRecoverable: false,
    }
  );
}
