import { getCurrentLocale } from "./get-locale";
import { getLocaleFromFormData } from "./form-locale";

/**
 * Resolves the locale to use for form processing by checking FormData first,
 * then falling back to the cookie locale.
 *
 * This pattern appears 8+ times in the codebase and is now centralized.
 *
 * @param formData - The form data containing potential locale
 * @returns The resolved locale string
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
export async function resolveFormLocale(formData: FormData): Promise<string> {
  const formLocale = getLocaleFromFormData(formData);
  const cookieLocale = await getCurrentLocale();

  // Use form locale if it's not the default, otherwise use cookie locale
  return formLocale !== "en" ? formLocale : cookieLocale;
}
