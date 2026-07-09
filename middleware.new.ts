import { NextRequest, NextResponse } from "next/server";
import {
  getSafeLocale,
  isValidLocale,
  type Locale,
  ALLOWED_LOCALES,
  DEFAULT_LOCALE,
} from "@/config/i18n";
import { getClientIP } from "@/lib/utils/request";

/**
 * Check if the request is for a static asset
 */
function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap.xml") ||
    pathname.match(
      /\.(jpg|jpeg|png|gif|svg|ico|webp|css|js|woff|woff2|ttf|otf)$/i,
    ) !== null
  );
}

/**
 * Check if path is auth-related
 */
function isAuthRelatedPath(pathname: string): boolean {
  return (
    pathname.includes("/auth/signin") ||
    pathname.includes("/auth/callback") ||
    pathname.includes("/api/auth/")
  );
}

/**
 * Extract locale from request with multiple fallback strategies
 */
function extractLocaleFromRequest(request: NextRequest): {
  locale: Locale;
  isValid: boolean;
  source: "path" | "cookie" | "header" | "default";
} {
  const pathname = request.nextUrl.pathname;

  // Strategy 1: Try to extract from path
  const pathMatch = pathname.match(/^\/([a-z]{2})(?:\/|$)/);
  if (pathMatch) {
    const possibleLocale = pathMatch[1];
    if (isValidLocale(possibleLocale)) {
      return { locale: possibleLocale, isValid: true, source: "path" };
    }

    // Log invalid locale attempts in production
    if (process.env.NODE_ENV === "production") {
      console.error("[Security] Invalid locale in path:", {
        attempted: possibleLocale,
        path: pathname,
        ip: getClientIP(request),
        userAgent: request.headers.get("user-agent"),
      });
    }
  }

  // Strategy 2: Try locale cookie
  const cookieLocale = request.cookies.get("locale")?.value;
  if (cookieLocale && isValidLocale(cookieLocale)) {
    return { locale: cookieLocale, isValid: true, source: "cookie" };
  }

  // Strategy 3: Try Accept-Language header
  const acceptLanguage = request.headers.get("accept-language");
  if (acceptLanguage) {
    // Parse accept-language header (e.g., "en-US,en;q=0.9,es;q=0.8")
    const languages = acceptLanguage
      .split(",")
      .map((lang) => lang.split(";")[0].trim().toLowerCase())
      .map((lang) => lang.split("-")[0]); // Get language without region

    for (const lang of languages) {
      if (isValidLocale(lang)) {
        return { locale: lang as Locale, isValid: true, source: "header" };
      }
    }
  }

  // Default fallback
  return { locale: DEFAULT_LOCALE, isValid: false, source: "default" };
}

/**
 * Handle i18n routing - ensure locale is in path
 */
function handleI18nRouting(
  request: NextRequest,
  locale: Locale,
): NextResponse | null {
  const pathname = request.nextUrl.pathname;
  const search = request.nextUrl.search;

  // Skip API routes and static assets
  if (pathname.startsWith("/api") || isStaticAsset(pathname)) {
    return null;
  }

  // Check if locale is already in path
  const hasValidLocaleInPath = ALLOWED_LOCALES.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
  );

  // Special handling for root path
  if (pathname === "/") {
    const redirectUrl = new URL(request.url);
    redirectUrl.pathname = `/${locale}`;
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set("locale", locale, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
    return response;
  }

  // Redirect to localized path if locale not present or invalid
  if (!hasValidLocaleInPath) {
    // Extract clean path - remove any invalid locale-like prefix
    let cleanPath = pathname;

    // Check if path starts with what looks like a locale attempt: /XX/something
    const localeAttemptMatch = pathname.match(/^\/([^\/]+)(\/.+)$/);
    if (localeAttemptMatch) {
      const [, possibleLocale, restOfPath] = localeAttemptMatch;

      // If it's exactly 2 letters (typical locale) but not valid, strip it
      if (possibleLocale.length === 2 && !isValidLocale(possibleLocale)) {
        cleanPath = restOfPath;
      }
      // OR if it contains any suspicious characters that suggest an attack, strip it
      else if (
        possibleLocale.match(
          /[<>!@#$%^&*()"';={}]|%3C|%3E|%22|%27|script|alert|javascript|eval|onload|onerror/i,
        )
      ) {
        cleanPath = restOfPath;
      }
      // OR if it's unusually long (not a typical locale), strip it
      else if (possibleLocale.length > 10) {
        cleanPath = restOfPath;
      }
    }

    // Ensure clean path starts with /
    if (!cleanPath.startsWith("/")) {
      cleanPath = `/${cleanPath}`;
    }

    // Build redirect URL with locale prefix and preserve query params
    const redirectUrl = new URL(request.url);
    redirectUrl.pathname = `/${locale}${cleanPath}`;

    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set("locale", locale, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
    return response;
  }

  return null;
}

/**
 * Handle OAuth/Auth error redirects
 */
function handleAuthErrors(
  request: NextRequest,
  locale: Locale,
): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl;

  if (searchParams.has("error")) {
    const error = searchParams.get("error");

    if (isAuthRelatedPath(pathname)) {
      // Log auth errors for security monitoring
      console.log("[Security] Auth error redirect:", {
        error,
        locale,
        path: pathname,
        ip: getClientIP(request),
        timestamp: new Date().toISOString(),
      });

      // Create secure redirect URL
      const errorUrl = new URL(`/${locale}/auth/error`, request.url);
      errorUrl.searchParams.set("error", error || "");

      return NextResponse.redirect(errorUrl);
    }
  }

  return null;
}

/**
 * Main middleware function
 */
export function middleware(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname;

  // Early return for static assets
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // Extract and validate locale
  const { locale, isValid, source } = extractLocaleFromRequest(request);

  // Log security events for invalid locale attempts
  if (!isValid && source === "path" && process.env.NODE_ENV === "production") {
    console.error("[Security] Invalid locale attempt detected:", {
      path: pathname,
      source,
      ip: getClientIP(request),
      userAgent: request.headers.get("user-agent"),
      timestamp: new Date().toISOString(),
    });
  }

  // Handle i18n routing first (for proper locale setup)
  const i18nResponse = handleI18nRouting(request, locale);
  if (i18nResponse) {
    return i18nResponse;
  }

  // Handle auth errors with validated locale
  const authResponse = handleAuthErrors(request, locale);
  if (authResponse) {
    return authResponse;
  }

  // Add security headers to response
  const response = NextResponse.next();

  // Add locale header for downstream services
  response.headers.set("X-Locale", locale);

  // Add security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");

  return response;
}

/**
 * Middleware configuration
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:jpg|jpeg|png|gif|svg|ico|webp|css|js|woff|woff2|ttf|otf)$).*)",
    "/",
  ],
};
