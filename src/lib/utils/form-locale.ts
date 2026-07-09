/**
 * Utilities for handling locale in forms
 * Ensures correct language is used regardless of cookie state
 */

/**
 * Adds locale to FormData for server actions
 * @param formData - The form data to append to
 * @param locale - The current page locale
 * @returns The same FormData instance with locale added
 */
export function appendLocaleToFormData(
  formData: FormData,
  locale: string,
): FormData {
  formData.append("_locale", locale);
  return formData;
}

/**
 * Creates new FormData with locale pre-populated
 * @param locale - The current page locale
 * @param initialData - Optional initial form entries
 * @returns New FormData instance with locale
 */
export function createLocalizedFormData(
  locale: string,
  initialData?: Record<string, string>,
): FormData {
  const formData = new FormData();
  formData.append("_locale", locale);

  if (initialData) {
    Object.entries(initialData).forEach(([key, value]) => {
      formData.append(key, value);
    });
  }

  return formData;
}

/**
 * Extracts locale from FormData, with fallback
 * @param formData - The form data to extract from
 * @param fallback - Fallback locale if not found
 * @returns The locale string
 */
export function getLocaleFromFormData(
  formData: FormData,
  fallback: string = "en",
): string {
  return (formData.get("_locale") as string) || fallback;
}
