import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { translateValidationErrors } from "@/lib/validation";

/**
 * Base response interface for all action responses
 */
export interface BaseResponse {
  success: boolean;
  message: string;
}

/**
 * Error response with optional field errors
 */
export interface ErrorResponse extends BaseResponse {
  success: false;
  errors?: Record<string, string | string[]>;
}

/**
 * Success response with optional data
 */
export interface SuccessResponse extends BaseResponse {
  success: true;
  data?: unknown;
}

/**
 * Union type for all action responses
 */
export type ActionResponse = ErrorResponse | SuccessResponse;

/**
 * Creates a standardized error response
 *
 * @param message - The error message to display
 * @param errors - Optional field errors (can be ZodError or plain object)
 * @returns Standardized error response
 *
 * @example
 * // Simple error
 * return createErrorResponse("User not found");
 *
 * @example
 * // With field errors
 * return createErrorResponse("Validation failed", { email: "Invalid email" });
 *
 * @example
 * // With ZodError
 * return createErrorResponse("Validation failed", zodError);
 */
export function createErrorResponse(
  message: string,
  errors?: z.ZodError | Record<string, string | string[]>,
): ErrorResponse {
  if (errors instanceof z.ZodError) {
    return {
      success: false,
      message,
      errors: errors.flatten().fieldErrors,
    };
  }

  return {
    success: false,
    message,
    errors,
  };
}

/**
 * Creates a validation error response with translated messages
 *
 * @param error - The ZodError to process
 * @param locale - The locale for translations
 * @param defaultMessage - Optional custom message (defaults to translated validation error)
 * @returns Promise resolving to error response with translated errors
 *
 * @example
 * if (error instanceof z.ZodError) {
 *   return createValidationErrorResponse(error, locale);
 * }
 */
export async function createValidationErrorResponse(
  error: z.ZodError,
  locale: string,
  defaultMessage?: string,
): Promise<ErrorResponse> {
  const errors = await translateValidationErrors(error, locale);

  if (!defaultMessage) {
    const t = await getTranslations({ locale, namespace: "validation" });
    defaultMessage = t("form.validationError");
  }

  return createErrorResponse(defaultMessage, errors);
}

/**
 * Type guard to check if response is an error
 */
export function isErrorResponse(
  response: ActionResponse,
): response is ErrorResponse {
  return !response.success;
}

/**
 * Gets a specific field error from an error response
 *
 * @param response - The error response
 * @param field - The field name to get error for
 * @returns The field error message or undefined
 */
export function getFieldError(
  response: ErrorResponse,
  field: string,
): string | undefined {
  const error = response.errors?.[field];
  return Array.isArray(error) ? error[0] : error;
}

/**
 * Gets all field errors as a flat array of strings
 *
 * @param response - The error response
 * @returns Array of all error messages
 */
export function getAllFieldErrors(response: ErrorResponse): string[] {
  if (!response.errors) return [];

  return Object.values(response.errors)
    .flat()
    .filter((error): error is string => typeof error === "string");
}

/**
 * Logs action errors with context
 *
 * @param actionName - The name of the action that failed
 * @param error - The error that occurred
 * @param context - Optional additional context
 */
export function logActionError(
  actionName: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  console.error(`[${actionName}] Error:`, {
    error,
    message: error instanceof Error ? error.message : "Unknown error",
    stack: error instanceof Error ? error.stack : undefined,
    context,
    timestamp: new Date().toISOString(),
  });
}
