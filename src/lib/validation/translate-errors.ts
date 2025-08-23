import { z } from "zod";
import { getTranslations } from "next-intl/server";

/**
 * Translates Zod validation errors using the current locale
 * @param errors - Zod errors object
 * @param locale - Current locale
 * @returns Translated error messages
 */
export async function translateValidationErrors(
  errors: z.ZodError,
  locale: string
): Promise<Record<string, string>> {
  const t = await getTranslations({ locale, namespace: "validation" });
  const translatedErrors: Record<string, string> = {};

  errors.issues.forEach((issue) => {
    const field = issue.path[0] as string;
    if (field) {
      // The message is now an i18n key like "validation.password.minLength"
      // Remove the "validation." prefix since we're already in that namespace
      const messageKey = issue.message.replace("validation.", "");
      
      try {
        // Translate the message key
        translatedErrors[field] = t(messageKey);
      } catch (_error) { // eslint-disable-line @typescript-eslint/no-unused-vars
        // Fallback to the key itself if translation not found
        console.warn(`Translation not found for key: ${messageKey}`);
        translatedErrors[field] = issue.message;
      }
    }
  });

  return translatedErrors;
}

/**
 * Helper to get a single validation error message
 * @param key - Translation key (without validation prefix)
 * @param locale - Current locale
 * @returns Translated message
 */
export async function getValidationMessage(
  key: string,
  locale: string
): Promise<string> {
  try {
    const t = await getTranslations({ locale, namespace: "validation" });
    return t(key);
  } catch (_error) { // eslint-disable-line @typescript-eslint/no-unused-vars
    console.warn(`Translation not found for key: ${key}`);
    return key;
  }
}