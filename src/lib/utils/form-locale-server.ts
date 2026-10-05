import { DEFAULT_LOCALE, getSafeLocale, type Locale } from "@/config/i18n";
import { getCurrentLocale } from "./get-locale";
import { getLocaleFromFormData } from "./form-locale";

/**
 * Resolves the locale to use for form processing by checking FormData first,
 * then falling back to the cookie locale.
 *
 * This pattern appears 8+ times in the codebase and is now centralized.
 *
 * The form field and the cookie both come from the client: only one of the
 * supported locales is used, and any other value counts as not sent. The
 * result is always a supported locale.
 *
 * A field that says the default locale cannot be told from a field that was
 * not sent (getLocaleFromFormData answers the default for both), so the
 * cookie decides for it as well: a form sent from an English page is
 * answered in the language of the cookie when the cookie names another one.
 *
 * @param formData - The form data containing potential locale
 * @returns The resolved locale
 *
 * @example
 * // Before (3 lines):
 * const formLocale = getLocaleFromFormData(formData);
 * const cookieLocale = await getCurrentLocale();
 * const locale = formLocale !== 'en' ? formLocale : cookieLocale;
 *
 * // After (1 line):
 * const locale = await resolveFormLocale(formData);
 */
export async function resolveFormLocale(formData: FormData): Promise<Locale> {
  const formLocale = getSafeLocale(getLocaleFromFormData(formData));
  const cookieLocale = getSafeLocale(await getCurrentLocale());

  // Use form locale if it's not the default, otherwise use cookie locale
  return formLocale !== DEFAULT_LOCALE ? formLocale : cookieLocale;
}
