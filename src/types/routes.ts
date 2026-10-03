/**
 * Application route type definitions
 * This file provides type-safe navigation throughout the application
 */

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/**
 * Static application routes
 */
export type StaticRoute =
  | "/"
  | "/auth/signin"
  | "/auth/signup"
  | "/auth/forgot-password"
  | "/auth/reset-password"
  | "/auth/verify-email"
  | "/auth/two-factor"
  | "/dashboard"
  | "/dashboard/user"
  | "/dashboard/pro"
  | "/dashboard/settings"
  | "/dashboard/profile"
  | "/admin"
  | "/admin/users"
  | "/admin/settings"
  | "/account"
  | "/account/profile"
  | "/account/security"
  | "/account/two-factor";

/**
 * Dynamic route patterns
 */
export type DynamicRoute =
  | `/dashboard/user/${string}`
  | `/dashboard/pro/${string}`
  | `/admin/users/${string}`
  | `/auth/reset-password/${string}`
  | `/auth/verify-email/${string}`;

/**
 * Locale-prefixed routes
 */
export type LocaleRoute =
  | `/${string}${StaticRoute}`
  | `/${string}${DynamicRoute}`;

/**
 * All valid application routes
 */
export type AppRoute = StaticRoute | DynamicRoute | LocaleRoute;

/**
 * Route validation helpers
 */
export class RouteValidator {
  /**
   * Static routes that are always valid
   */
  private static readonly STATIC_ROUTES: readonly string[] = [
    "/",
    "/auth/signin",
    "/auth/signup",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/verify-email",
    "/auth/two-factor",
    "/dashboard",
    "/dashboard/user",
    "/dashboard/pro",
    "/dashboard/settings",
    "/dashboard/profile",
    "/admin",
    "/admin/users",
    "/admin/settings",
    "/account",
    "/account/profile",
    "/account/security",
    "/account/two-factor",
  ];

  /**
   * Dynamic route patterns with regex validation
   */
  private static readonly DYNAMIC_PATTERNS: readonly RegExp[] = [
    /^\/dashboard\/user\/[a-zA-Z0-9\-_]+$/,
    /^\/dashboard\/pro\/[a-zA-Z0-9\-_]+$/,
    /^\/admin\/users\/[a-zA-Z0-9\-_]+$/,
    /^\/auth\/reset-password\/[a-zA-Z0-9\-_]+$/,
    /^\/auth\/verify-email\/[a-zA-Z0-9\-_]+$/,
  ];

  /**
   * Supported locales
   */
  private static readonly SUPPORTED_LOCALES = ["en", "es", "fr", "it", "de"];

  /**
   * Check if a string is a valid static route
   */
  static isStaticRoute(path: string): path is StaticRoute {
    return this.STATIC_ROUTES.includes(path);
  }

  /**
   * Check if a string matches a dynamic route pattern
   */
  static isDynamicRoute(path: string): path is DynamicRoute {
    return this.DYNAMIC_PATTERNS.some((pattern) => pattern.test(path));
  }

  /**
   * Check if a string is a valid locale-prefixed route
   */
  static isLocaleRoute(path: string): path is LocaleRoute {
    const segments = path.split("/");
    if (segments.length < 2) return false;

    const possibleLocale = segments[1];
    if (!this.SUPPORTED_LOCALES.includes(possibleLocale)) return false;

    const pathWithoutLocale = "/" + segments.slice(2).join("/");
    return this.isValidRoute(pathWithoutLocale);
  }

  /**
   * Check if a string is any valid application route
   */
  static isValidRoute(path: string): path is AppRoute {
    if (!path || typeof path !== "string") return false;

    // Remove query parameters and hash fragments for validation
    const cleanPath = path.split("?")[0].split("#")[0];

    return (
      this.isStaticRoute(cleanPath) ||
      this.isDynamicRoute(cleanPath) ||
      this.isLocaleRoute(cleanPath)
    );
  }

  /**
   * Sanitize and validate a route, return safe default if invalid
   */
  static getSafeRoute(
    path: string | undefined,
    fallback: StaticRoute = "/",
  ): AppRoute {
    if (!path || !this.isValidRoute(path)) {
      return fallback;
    }
    return path;
  }
}

/**
 * Navigation safety helpers
 */
export class SafeNavigation {
  /**
   * Type-safe router push with validation
   * Accepts Next.js AppRouterInstance and validates routes before navigation
   */
  static push(
    router: AppRouterInstance,
    path: string,
    fallback: StaticRoute = "/",
  ) {
    const safePath = RouteValidator.getSafeRoute(path, fallback);
    router.push(safePath);
  }
}
