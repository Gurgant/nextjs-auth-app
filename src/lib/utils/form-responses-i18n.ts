/**
 * Enhanced form response utilities with i18n support
 * These are async versions that support locale-based translations
 */

import { translateError, translateSuccess } from "./server-translations";
import type { ErrorResponse, SuccessResponse } from "./form-responses";

/**
 * Creates an error response with i18n support
 */
export async function createErrorResponseI18n(
  messageKey: string,
  locale?: string,
  fallbackMessage?: string,
): Promise<ErrorResponse> {
  // If locale is provided, try to translate the message
  const translatedMessage = locale
    ? await translateError(locale, messageKey, fallbackMessage || messageKey)
    : fallbackMessage || messageKey;

  return {
    success: false,
    message: translatedMessage,
  };
}

/**
 * Creates a field-specific error response with i18n support
 */
export async function createFieldErrorResponseI18n(
  messageKey: string,
  field: string,
  locale?: string,
  fallbackMessage?: string,
): Promise<ErrorResponse> {
  const translatedMessage = locale
    ? await translateError(locale, messageKey, fallbackMessage || messageKey)
    : fallbackMessage || messageKey;

  const translatedErrorMessage = locale
    ? await translateError(locale, messageKey, fallbackMessage || messageKey)
    : fallbackMessage || messageKey;

  return {
    success: false,
    message: translatedMessage,
    errors: {
      [field]: [translatedErrorMessage],
    },
  };
}

/**
 * Creates a success response with optional i18n support
 */
export async function createSuccessResponseI18n(
  messageKey: string,
  locale?: string,
  fallbackMessage?: string,
  data?: unknown,
): Promise<SuccessResponse> {
  const translatedMessage = locale
    ? await translateSuccess(locale, messageKey, fallbackMessage || messageKey)
    : fallbackMessage || messageKey;

  const response: SuccessResponse = {
    success: true,
    message: translatedMessage,
  };

  if (data !== undefined) {
    response.data = data;
  }

  return response;
}
