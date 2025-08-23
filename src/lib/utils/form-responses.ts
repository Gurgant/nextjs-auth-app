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
  data?: any;
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
 * Creates a standardized success response
 *
 * @param message - The success message to display
 * @param data - Optional data to include in response
 * @returns Standardized success response
 *
 * @example
 * // Simple success
 * return createSuccessResponse("Profile updated successfully");
 *
 * @example
 * // With data
 * return createSuccessResponse("User created", { userId: user.id });
 */
export function createSuccessResponse<T = any>(
  message: string,
  data?: T,
): SuccessResponse & { data?: T } {
  return data !== undefined
    ? { success: true, message, data }
    : { success: true, message };
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
 * Creates an error response for a single field
 *
 * @param message - The main error message
 * @param field - The field name that has the error
 * @param fieldError - The error message for the field
 * @returns Error response with field error
 *
 * @example
 * return createFieldErrorResponse(
 *   "Invalid credentials",
 *   "password",
 *   "Incorrect password"
 * );
 */
export function createFieldErrorResponse(
  message: string,
  field: string,
  fieldError: string,
): ErrorResponse {
  return createErrorResponse(message, {
    [field]: fieldError,
  });
}

/**
 * Common error types for consistent messaging
 */
export type CommonErrorType =
  | "notFound"
  | "unauthorized"
  | "forbidden"
  | "serverError"
  | "unknown"
  | "alreadyExists"
  | "invalidInput";

/**
 * Creates a generic error response for common error types
 *
 * @param type - The type of error
 * @param customMessage - Optional custom message to override default
 * @returns Error response with appropriate message
 *
 * @example
 * if (!user) {
 *   return createGenericErrorResponse('notFound', 'User not found');
 * }
 */
export function createGenericErrorResponse(
  type: CommonErrorType,
  customMessage?: string,
  locale?: string,
): ErrorResponse {
  // TODO: When locale is provided, use async translation
  // For now, we'll keep the synchronous behavior for backward compatibility
  // Use createGenericErrorResponseI18n from form-responses-i18n.ts for full i18n support
  const messages: Record<CommonErrorType, string> = {
    notFound: "Resource not found",
    unauthorized: "You are not authorized to perform this action",
    forbidden: "Access forbidden",
    serverError: "An error occurred on the server",
    unknown: "Something went wrong. Please try again.",
    alreadyExists: "This resource already exists",
    invalidInput: "Invalid input provided",
  };

  return createErrorResponse(
    customMessage || messages[type] || messages.unknown,
  );
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
 * Type guard to check if response is a success
 */
export function isSuccessResponse(
  response: ActionResponse,
): response is SuccessResponse {
  return response.success;
}

/**
 * Checks if an error response has field errors
 */
export function hasFieldErrors(response: ActionResponse): boolean {
  return (
    isErrorResponse(response) &&
    !!response.errors &&
    Object.keys(response.errors).length > 0
  );
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
 * Wraps an action with error handling
 *
 * @param action - The async action to execute
 * @param locale - The locale for error translations
 * @param actionName - Optional name for logging
 * @returns Promise resolving to action response
 *
 * @example
 * return withErrorHandling(
 *   async () => {
 *     // Your action logic here
 *     return createSuccessResponse("Done!");
 *   },
 *   locale,
 *   "updateProfile"
 * );
 */
export async function withErrorHandling<T extends ActionResponse>(
  action: () => Promise<T>,
  locale: string,
  actionName?: string,
): Promise<ActionResponse> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createValidationErrorResponse(error, locale);
    }

    logActionError(actionName || "unknown", error);
    return createGenericErrorResponse("unknown");
  }
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
  context?: Record<string, any>,
): void {
  console.error(`[${actionName}] Error:`, {
    error,
    message: error instanceof Error ? error.message : "Unknown error",
    stack: error instanceof Error ? error.stack : undefined,
    context,
    timestamp: new Date().toISOString(),
  });
}
