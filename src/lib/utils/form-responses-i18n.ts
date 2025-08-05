/**
 * Enhanced form response utilities with i18n support
 * These are async versions that support locale-based translations
 */

import { translateError, translateCommonError, translateSuccess } from './server-translations';
import type { 
  ErrorResponse, 
  SuccessResponse, 
  CommonErrorType 
} from './form-responses';

/**
 * Creates an error response with i18n support
 */
export async function createErrorResponseI18n(
  messageKey: string,
  locale?: string,
  fallbackMessage?: string
): Promise<ErrorResponse> {
  // If locale is provided, try to translate the message
  const translatedMessage = locale 
    ? await translateError(locale, messageKey, fallbackMessage || messageKey)
    : (fallbackMessage || messageKey);

  return {
    success: false,
    message: translatedMessage
  };
}

/**
 * Creates a field-specific error response with i18n support
 */
export async function createFieldErrorResponseI18n(
  messageKey: string,
  field: string,
  locale?: string,
  fallbackMessage?: string
): Promise<ErrorResponse> {
  const translatedMessage = locale 
    ? await translateError(locale, messageKey, fallbackMessage || messageKey)
    : (fallbackMessage || messageKey);
  
  const translatedErrorMessage = locale 
    ? await translateError(locale, messageKey, fallbackMessage || messageKey)
    : (fallbackMessage || messageKey);

  return {
    success: false,
    message: translatedMessage,
    errors: {
      [field]: [translatedErrorMessage]
    }
  };
}

/**
 * Creates a generic error response based on common error types with i18n support
 */
export async function createGenericErrorResponseI18n(
  type: CommonErrorType,
  customMessage?: string,
  locale?: string
): Promise<ErrorResponse> {
  let message: string;
  
  if (customMessage) {
    message = locale 
      ? await translateError(locale, customMessage, customMessage)
      : customMessage;
  } else if (locale) {
    message = await translateCommonError(locale, type);
  } else {
    // Fallback to English messages
    const messages: Record<CommonErrorType, string> = {
      notFound: "Resource not found",
      unauthorized: "You are not authorized to perform this action",
      forbidden: "Access forbidden",
      serverError: "An error occurred on the server",
      unknown: "Something went wrong. Please try again.",
      alreadyExists: "This resource already exists",
      invalidInput: "Invalid input provided"
    };
    message = messages[type] || messages.unknown;
  }

  return createErrorResponseI18n(message);
}

/**
 * Creates a success response with optional i18n support
 */
export async function createSuccessResponseI18n(
  messageKey: string,
  locale?: string,
  fallbackMessage?: string,
  data?: any
): Promise<SuccessResponse> {
  const translatedMessage = locale 
    ? await translateSuccess(locale, messageKey, fallbackMessage || messageKey)
    : (fallbackMessage || messageKey);

  const response: SuccessResponse = {
    success: true,
    message: translatedMessage
  };

  if (data !== undefined) {
    response.data = data;
  }

  return response;
}