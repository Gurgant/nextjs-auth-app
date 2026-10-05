/**
 * Navigation utilities for locale-aware routing
 * Provides type-safe functions for building localized paths
 */

import type { Locale } from "@/config/i18n";

/**
 * Build a localized path by prepending the locale
 *
 * @param pathOrSegments - The path (string) or path segments (array) without locale prefix
 * @param locale - The validated locale to prepend
 * @returns The full path with locale prefix
 *
 * @example
 * localizedPath('dashboard', 'en') // '/en/dashboard'
 * localizedPath('/dashboard', 'en') // '/en/dashboard'
 * localizedPath('', 'en') // '/en'
 * localizedPath(['dashboard'], 'en') // '/en/dashboard'
 * localizedPath(['dashboard', 'user'], 'en') // '/en/dashboard/user'
 */
export function localizedPath(
  pathOrSegments: string | string[],
  locale: Locale,
): string {
  let path: string;

  if (Array.isArray(pathOrSegments)) {
    // Handle array of segments
    path = pathOrSegments.filter(Boolean).join("/");
  } else {
    // Handle string path
    path = pathOrSegments;
  }

  // Remove leading slash if present to avoid double slashes
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;

  // Handle empty path (home page)
  if (!cleanPath) {
    return `/${locale}`;
  }

  return `/${locale}/${cleanPath}`;
}

/**
 * Extract path without locale prefix
 * Useful for comparing paths across locales
 *
 * @param fullPath - The full path including locale
 * @returns The path without locale prefix
 *
 * @example
 * getPathWithoutLocale('/en/dashboard') // '/dashboard'
 * getPathWithoutLocale('/fr/') // '/'
 */
export function getPathWithoutLocale(fullPath: string): string {
  // Match pattern: /locale/rest-of-path or just /locale
  const match = fullPath.match(/^\/[a-z]{2}(?:-[A-Z]{2})?(\/.*)?$/);

  if (match) {
    // Return the rest of the path or '/' if no rest
    return match[1] || "/";
  }

  // If no locale pattern found, return original path
  return fullPath;
}

/**
 * Switch to a different locale while preserving the current path
 *
 * Whatever `currentPath` is, the result starts with `/<newLocale>` and a URL
 * parser resolves it on the same origin, to `/<newLocale>` or to a path below
 * it. The language selector navigates to it without consulting a list of
 * routes. A path that would resolve outside the new locale has dot segments
 * (`..`, also written `%2e%2e`); the pathname of a parsed URL has none, and
 * for such a path the result is `/<newLocale>`.
 *
 * @param currentPath - The current full path
 * @param newLocale - The locale to switch to
 * @returns The new path with the switched locale
 *
 * @example
 * switchLocale('/en/dashboard', 'fr') // '/fr/dashboard'
 * switchLocale('/en/../admin', 'fr') // '/fr'
 */
export function switchLocale(currentPath: string, newLocale: Locale): string {
  const home = localizedPath("", newLocale);
  const switched = localizedPath(getPathWithoutLocale(currentPath), newLocale);

  // What a URL parser makes of the path. The base only stands in for an
  // origin: `switched` starts with "/<newLocale>", so it is parsed as a path.
  const { pathname } = new URL(switched, "http://localhost");
  return `${pathname}/`.startsWith(`${home}/`) ? switched : home;
}

/**
 * Type-safe route builder for common routes
 * Extend this object with your app's routes
 */
export const routes = {
  dashboard: (locale: Locale) => localizedPath("dashboard", locale),
} as const;
