import { getTranslations } from 'next-intl/server';

/**
 * Server-side translation helper for error messages
 * This allows us to translate error messages on the server based on locale
 */
export async function getServerTranslations(locale: string, namespace: string) {
  return getTranslations({ locale, namespace });
}

/**
 * Get error message translations
 */
export async function getErrorTranslations(locale: string) {
  return getServerTranslations(locale, 'Errors');
}

/**
 * Get common translations (for generic messages)
 */
export async function getCommonTranslations(locale: string) {
  return getServerTranslations(locale, 'Common');
}

/**
 * Get success message translations
 */
export async function getSuccessTranslations(locale: string) {
  return getServerTranslations(locale, 'Success');
}

/**
 * Translate a specific error type
 */
export async function translateError(locale: string, errorKey: string, defaultMessage?: string): Promise<string> {
  try {
    const t = await getErrorTranslations(locale);
    // Try to get the translation, fallback to default message or key
    return t(errorKey) || defaultMessage || errorKey;
  } catch (error) {
    console.error('Translation error:', error);
    return defaultMessage || errorKey;
  }
}

/**
 * Translate a specific success message
 */
export async function translateSuccess(locale: string, successKey: string, defaultMessage?: string): Promise<string> {
  try {
    const t = await getSuccessTranslations(locale);
    // Try to get the translation, fallback to default message or key
    return t(successKey) || defaultMessage || successKey;
  } catch (error) {
    console.error('Translation error:', error);
    return defaultMessage || successKey;
  }
}

/**
 * Translate common error types
 */
export async function translateCommonError(
  locale: string,
  type: 'notFound' | 'unauthorized' | 'forbidden' | 'serverError' | 'unknown' | 'alreadyExists' | 'invalidInput'
): Promise<string> {
  const errorKeys = {
    notFound: 'notFound',
    unauthorized: 'unauthorized',
    forbidden: 'forbidden',
    serverError: 'serverError',
    unknown: 'unknown',
    alreadyExists: 'alreadyExists',
    invalidInput: 'invalidInput'
  };

  return translateError(locale, errorKeys[type]);
}