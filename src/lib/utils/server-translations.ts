import { getTranslations } from "next-intl/server";

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
  return getServerTranslations(locale, "Errors");
}

/**
 * Get success message translations
 */
export async function getSuccessTranslations(locale: string) {
  return getServerTranslations(locale, "Success");
}

/**
 * Translate a specific error type
 */
export async function translateError(
  locale: string,
  errorKey: string,
  defaultMessage?: string,
): Promise<string> {
  try {
    const t = await getErrorTranslations(locale);
    // Message keys live FLAT under the "Errors" namespace, but call sites
    // historically pass "errors.<key>" — which would resolve to the
    // non-existent "Errors.errors.<key>" and swallow every error message.
    // Normalize the legacy prefix away.
    const key = errorKey.replace(/^errors\./, "");
    // Try to get the translation, fallback to default message or key
    return t(key) || defaultMessage || errorKey;
  } catch (error) {
    console.error("Translation error:", error);
    return defaultMessage || errorKey;
  }
}

/**
 * Translate a specific success message
 */
export async function translateSuccess(
  locale: string,
  successKey: string,
  defaultMessage?: string,
): Promise<string> {
  try {
    const t = await getSuccessTranslations(locale);
    // Same normalization as translateError: keys are flat under "Success",
    // call sites pass a legacy "success." prefix.
    const key = successKey.replace(/^success\./, "");
    // Try to get the translation, fallback to default message or key
    return t(key) || defaultMessage || successKey;
  } catch (error) {
    console.error("Translation error:", error);
    return defaultMessage || successKey;
  }
}
