/**
 * Navigation utilities for locale-aware routing
 * Provides type-safe functions for building localized paths
 */

import { redirect } from "next/navigation";
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
 * localizedPath(['account', 'settings'], 'en') // '/en/account/settings'
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
 * Redirect to a localized path (server-side only)
 *
 * @param path - The path to redirect to
 * @param locale - The validated locale
 *
 * @example
 * localizedRedirect('dashboard', locale) // Redirects to /[locale]/dashboard
 */
export function localizedRedirect(path: string, locale: Locale): never {
  const fullPath = localizedPath(path, locale);
  redirect(fullPath);
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
 * @param currentPath - The current full path
 * @param newLocale - The locale to switch to
 * @returns The new path with the switched locale
 *
 * @example
 * switchLocale('/en/dashboard', 'fr') // '/fr/dashboard'
 */
export function switchLocale(currentPath: string, newLocale: Locale): string {
  const pathWithoutLocale = getPathWithoutLocale(currentPath);
  return localizedPath(pathWithoutLocale, newLocale);
}

/**
 * Type-safe route builder for common routes
 * Extend this object with your app's routes
 */
export const routes = {
  home: (locale: Locale) => localizedPath("", locale),
  dashboard: (locale: Locale) => localizedPath("dashboard", locale),
  account: (locale: Locale) => localizedPath("account", locale),
  signin: (locale: Locale) => localizedPath("auth/signin", locale),
  register: (locale: Locale) => localizedPath("register", locale),
  error: (locale: Locale, error?: string) => {
    const path = localizedPath("auth/error", locale);
    return error ? `${path}?error=${encodeURIComponent(error)}` : path;
  },
  verifyEmail: (locale: Locale, token: string) =>
    localizedPath(`verify-email/${token}`, locale),
  linkAccount: (locale: Locale, token?: string) =>
    token
      ? localizedPath(`link-account/confirm/${token}`, locale)
      : localizedPath("link-account", locale),
} as const;

/**
 * Check if a path requires authentication
 * Useful for middleware and guards
 */
export function isProtectedRoute(path: string): boolean {
  const protectedPaths = ["/dashboard", "/account", "/settings", "/profile"];

  const pathWithoutLocale = getPathWithoutLocale(path);

  return protectedPaths.some(
    (protectedPath) =>
      pathWithoutLocale === protectedPath ||
      pathWithoutLocale.startsWith(`${protectedPath}/`),
  );
}

/**
 * Check if a path is public (doesn't require auth)
 */
export function isPublicRoute(path: string): boolean {
  const publicPaths = [
    "/",
    "/register",
    "/auth/signin",
    "/auth/error",
    "/verify-email",
    "/reset-password",
  ];

  const pathWithoutLocale = getPathWithoutLocale(path);

  return publicPaths.some(
    (publicPath) =>
      pathWithoutLocale === publicPath ||
      pathWithoutLocale.startsWith(`${publicPath}/`),
  );
}
