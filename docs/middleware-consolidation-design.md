# Middleware Consolidation Design Document

## Current State Analysis

### 1. Root Middleware (`/middleware.ts`)

- **Purpose**: Handles OAuth/Auth error redirects
- **Security Issue**: Uses unsafe locale extraction: `pathname.split('/')[1] || 'en'`
- **Functionality**: Redirects auth errors to localized error page
- **Active**: YES (Next.js only recognizes root middleware)

### 2. Src Middleware (`/src/middleware.ts`)

- **Purpose**: Handles i18n routing via next-intl
- **Functionality**: Adds locale prefix to routes
- **Active**: NO (Ignored by Next.js)
- **Problem**: This middleware is never executed!

## The Problem

Next.js only supports ONE middleware file in the root directory. The `/src/middleware.ts` is completely ignored, meaning:

- ❌ The i18n routing is not actually working via middleware
- ❌ The locale prefixing must be happening elsewhere (likely in app router)
- ❌ We have conflicting middleware configurations

## Proposed Solution: Unified Secure Middleware

### Architecture Overview

```typescript
// /middleware.ts - Unified middleware handling both i18n and auth errors
import { NextRequest, NextResponse } from "next/server";
import { getSafeLocale, ALLOWED_LOCALES } from "@/config/i18n";

export function middleware(request: NextRequest) {
  // 1. Extract and validate locale securely
  // 2. Handle i18n routing
  // 3. Handle auth error redirects
  // 4. Apply security headers
  // 5. Log security events
}
```

### Design Principles

1. **Security First**
   - Always validate locale against whitelist
   - Never trust URL parsing without validation
   - Log all security-relevant events

2. **Single Responsibility**
   - One middleware handles all cross-cutting concerns
   - Clear separation of i18n and auth logic
   - Maintainable and testable

3. **Performance**
   - Early returns for static assets
   - Efficient locale extraction
   - Minimal processing overhead

## Implementation Plan

### Phase 1: Secure Locale Extraction

```typescript
function extractLocaleFromRequest(request: NextRequest): {
  locale: Locale;
  isValid: boolean;
  source: "path" | "cookie" | "header" | "default";
} {
  const pathname = request.nextUrl.pathname;

  // Try to extract from path
  const pathMatch = pathname.match(/^\/([a-z]{2})(?:\/|$)/);
  if (pathMatch) {
    const possibleLocale = pathMatch[1];
    if (isValidLocale(possibleLocale)) {
      return { locale: possibleLocale, isValid: true, source: "path" };
    }
  }

  // Fallback to cookie
  const cookieLocale = request.cookies.get("locale")?.value;
  if (cookieLocale && isValidLocale(cookieLocale)) {
    return { locale: cookieLocale, isValid: true, source: "cookie" };
  }

  // Fallback to Accept-Language header
  const acceptLanguage = request.headers.get("accept-language");
  // Parse and validate...

  // Default
  return { locale: DEFAULT_LOCALE, isValid: false, source: "default" };
}
```

### Phase 2: I18n Routing Logic

```typescript
function handleI18nRouting(request: NextRequest, locale: Locale) {
  const pathname = request.nextUrl.pathname;

  // Check if locale is in path
  const hasLocaleInPath = ALLOWED_LOCALES.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
  );

  if (!hasLocaleInPath) {
    // Redirect to localized path
    return NextResponse.redirect(new URL(`/${locale}${pathname}`, request.url));
  }

  // Continue with request
  return null;
}
```

### Phase 3: Auth Error Handling

```typescript
function handleAuthErrors(request: NextRequest, locale: Locale) {
  const { pathname, searchParams } = request.nextUrl;

  if (searchParams.has("error")) {
    const error = searchParams.get("error");

    if (isAuthRelatedPath(pathname)) {
      console.log("[Security] Auth error redirect:", {
        error,
        locale,
        path: pathname,
        ip: request.ip,
      });

      return NextResponse.redirect(
        new URL(`/${locale}/auth/error?error=${error}`, request.url),
      );
    }
  }

  return null;
}
```

### Phase 4: Complete Middleware

```typescript
export function middleware(request: NextRequest) {
  // Skip static assets
  if (isStaticAsset(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // Extract and validate locale
  const { locale, isValid, source } = extractLocaleFromRequest(request);

  // Log invalid locale attempts
  if (!isValid && process.env.NODE_ENV === "production") {
    console.error("[Security] Invalid locale attempt:", {
      attempted: request.nextUrl.pathname.split("/")[1],
      source,
      ip: request.ip,
    });
  }

  // Handle i18n routing
  const i18nResponse = handleI18nRouting(request, locale);
  if (i18nResponse) return i18nResponse;

  // Handle auth errors
  const authResponse = handleAuthErrors(request, locale);
  if (authResponse) return authResponse;

  // Add security headers
  const response = NextResponse.next();
  response.headers.set("X-Locale", locale);

  return response;
}
```

## Migration Steps

1. **Create new middleware in parallel**
   - Implement as `middleware.new.ts`
   - Test thoroughly without affecting production

2. **Test all scenarios**
   - Valid locales: /en, /es, /fr, /it, /de
   - Invalid locales: /xx, /eng, /../
   - Auth errors with various locales
   - API routes exemption
   - Static assets exemption

3. **Performance testing**
   - Measure middleware overhead
   - Optimize hot paths
   - Add caching if needed

4. **Staged deployment**
   - Deploy to development
   - Monitor for issues
   - Deploy to staging
   - Final production deployment

## Breaking Changes

1. **Locale Cookie Name**
   - May need to standardize cookie name
   - Ensure consistency with client-side code

2. **API Routes**
   - Currently exempt from i18n
   - May need locale validation for API routes

3. **Redirect Behavior**
   - URLs without locale will redirect
   - May affect SEO or external links

## Rollback Plan

1. Keep backup of current middleware
2. Test rollback procedure in staging
3. Monitor error rates after deployment
4. Quick rollback script ready:
   ```bash
   # Rollback script
   cp backups/middleware.backup.ts middleware.ts
   npm run build
   npm run deploy
   ```

## Success Criteria

- ✅ All locale extractions are validated
- ✅ No security vulnerabilities in locale handling
- ✅ Auth errors redirect correctly with locale
- ✅ I18n routing works as expected
- ✅ Performance impact < 5ms per request
- ✅ Zero breaking changes for end users
- ✅ Comprehensive logging for security events

## Next Steps

1. Review this design with team
2. Create `middleware.new.ts` implementation
3. Write comprehensive tests
4. Begin phased migration
