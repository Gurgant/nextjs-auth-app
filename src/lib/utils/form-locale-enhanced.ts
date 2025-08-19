import { getTranslations } from 'next-intl/server';
import { getCurrentLocale } from './get-locale';
import { getLocaleFromFormData } from './form-locale';

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
  return formLocale !== 'en' ? formLocale : cookieLocale;
}

/**
 * Gets translations for a specific namespace using the locale from FormData.
 * Combines locale resolution and translation fetching into a single call.
 * 
 * @param formData - The form data containing potential locale
 * @param namespace - The translation namespace to load
 * @returns The translation function
 * 
 * @example
 * // Before (4 lines):
 * const formLocale = getLocaleFromFormData(formData);
 * const cookieLocale = await getCurrentLocale();
 * const locale = formLocale !== 'en' ? formLocale : cookieLocale;
 * const t = await getTranslations({ locale, namespace: "validation" });
 * 
 * // After (1 line):
 * const t = await getFormTranslations(formData, "validation");
 */
export async function getFormTranslations(
  formData: FormData,
  namespace: string
) {
  const locale = await resolveFormLocale(formData);
  return getTranslations({ locale, namespace });
}

/**
 * Type-safe wrapper for getting form translations with specific namespaces
 */
export type FormTranslationNamespaces = 
  | 'validation'
  | 'auth'
  | 'errors'
  | 'success'
  | 'common';

/**
 * Gets typed translations for common form namespaces
 * 
 * @example
 * const t = await getTypedFormTranslations(formData, 'validation');
 * // TypeScript knows this is validation namespace translations
 */
export async function getTypedFormTranslations<T extends FormTranslationNamespaces>(
  formData: FormData,
  namespace: T
) {
  return getFormTranslations(formData, namespace);
}