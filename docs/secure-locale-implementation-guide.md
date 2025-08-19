# Secure Locale Implementation Guide

## Overview

This guide provides a comprehensive approach to implementing secure locale handling throughout the Next.js application, replacing unsafe URL parsing with validated, type-safe locale extraction.

## Core Implementation Pattern

### 1. Central i18n Configuration

```typescript
// src/config/i18n.ts
export const ALLOWED_LOCALES = ['en', 'fr', 'es', 'de'] as const
export type Locale = typeof ALLOWED_LOCALES[number]

export const DEFAULT_LOCALE: Locale = 'en'

// Type guard function
export function isValidLocale(value: unknown): value is Locale {
  return typeof value === 'string' && 
    ALLOWED_LOCALES.includes(value as Locale)
}

// Helper to get safe locale
export function getSafeLocale(value: unknown): Locale {
  return isValidLocale(value) ? value : DEFAULT_LOCALE
}
```

### 2. Client Component Implementation

```typescript
// src/app/[locale]/auth/error/page.tsx
'use client'

import { useParams } from 'next/navigation'
import { getSafeLocale } from '@/config/i18n'

export default function AuthErrorPage() {
  const params = useParams()
  const locale = getSafeLocale(params.locale)
  
  // Now locale is guaranteed to be a valid Locale type
  // Use it safely throughout the component
}
```

### 3. Server Component Implementation

```typescript
// src/app/[locale]/some-page/page.tsx
import { getSafeLocale } from '@/config/i18n'

interface Props {
  params: Promise<{ locale: string }>
}

export default async function SomePage({ params }: Props) {
  const { locale: rawLocale } = await params
  const locale = getSafeLocale(rawLocale)
  
  // Locale is validated and typed
}
```

### 4. Custom Hook for Reusability

```typescript
// src/hooks/use-safe-locale.ts
'use client'

import { useParams } from 'next/navigation'
import { getSafeLocale, type Locale } from '@/config/i18n'

export function useSafeLocale(): Locale {
  const params = useParams()
  return getSafeLocale(params.locale)
}

// Usage in any client component
export default function MyComponent() {
  const locale = useSafeLocale()
  // Ready to use, no validation needed
}
```

### 5. Enhanced Version with Logging

```typescript
// src/config/i18n.ts - Enhanced version
export function getSafeLocale(
  value: unknown, 
  options?: { 
    logInvalid?: boolean 
    source?: string 
  }
): Locale {
  if (isValidLocale(value)) {
    return value
  }
  
  // Log invalid attempts in development
  if (options?.logInvalid && process.env.NODE_ENV === 'development') {
    console.warn(
      `Invalid locale attempted: "${value}" from ${options.source || 'unknown source'}`
    )
  }
  
  return DEFAULT_LOCALE
}

// Usage with logging
const locale = getSafeLocale(params.locale, { 
  logInvalid: true, 
  source: 'AuthErrorPage' 
})
```

### 6. Middleware Integration (Optional)

```typescript
// src/middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ALLOWED_LOCALES, DEFAULT_LOCALE } from '@/config/i18n'

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const pathnameLocale = pathname.split('/')[1]
  
  // Check if locale in path is valid
  if (!ALLOWED_LOCALES.includes(pathnameLocale as any)) {
    // Redirect to default locale
    const newUrl = new URL(request.url)
    newUrl.pathname = `/${DEFAULT_LOCALE}${pathname}`
    return NextResponse.redirect(newUrl)
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico).*)']
}
```

### 7. Type-Safe Navigation Helper

```typescript
// src/utils/navigation.ts
import type { Locale } from '@/config/i18n'

export function localizedPath(path: string, locale: Locale): string {
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  return `/${locale}/${cleanPath}`
}

export function localizedRedirect(path: string, locale: Locale) {
  return redirect(localizedPath(path, locale))
}

// Usage
import { useRouter } from 'next/navigation'
import { useSafeLocale } from '@/hooks/use-safe-locale'

function MyComponent() {
  const router = useRouter()
  const locale = useSafeLocale()
  
  const handleNavigate = () => {
    router.push(localizedPath('dashboard', locale))
  }
}
```

### 8. Testing Utilities

```typescript
// src/test/locale-helpers.ts
import { getSafeLocale, ALLOWED_LOCALES } from '@/config/i18n'

describe('Locale Validation', () => {
  test('accepts valid locales', () => {
    ALLOWED_LOCALES.forEach(locale => {
      expect(getSafeLocale(locale)).toBe(locale)
    })
  })
  
  test('rejects invalid locales', () => {
    const invalid = ['xx', '123', null, undefined, '', 'en-XY']
    invalid.forEach(value => {
      expect(getSafeLocale(value)).toBe('en')
    })
  })
})
```

### 9. Complete Implementation Example

```typescript
// Updated auth error page with all best practices
'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useSafeLocale } from '@/hooks/use-safe-locale'
import { localizedPath } from '@/utils/navigation'

export default function AuthErrorPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const locale = useSafeLocale() // Type-safe, validated locale
  const t = useTranslations('Auth')
  
  const error = searchParams.get('error')
  
  const handleSignInWithEmail = () => {
    router.push(localizedPath('', locale)) // Goes to /[locale]
  }
  
  const handleTryDifferentAccount = () => {
    router.push(localizedPath('', locale))
  }
  
  const handleGoBack = () => {
    router.push(localizedPath('', locale))
  }
  
  // Rest of component...
}
```

## Key Benefits

1. **Single Source of Truth**: All locale config in one file
2. **Type Safety**: Full TypeScript support
3. **Reusability**: Hooks and utilities work everywhere
4. **Maintainability**: Add/remove locales in one place
5. **Security**: Validated at every level
6. **Developer Experience**: Simple, consistent API
7. **Testing**: Easy to test validation logic
8. **Performance**: Minimal overhead with memoization possible

## Security Advantages

- No direct URL manipulation
- Whitelist validation at every level
- Type-safe implementation prevents errors
- Framework-integrated approach (useParams)
- Predictable fallback behavior
- Optional attack logging

## Migration Strategy

1. Start with the config file
2. Create the custom hook
3. Update high-risk components first (auth pages, error pages)
4. Gradually migrate all components
5. Add middleware for extra protection
6. Remove all instances of `window.location.pathname` parsing

## Best Practices

1. **Always use the hook or helper functions** - never parse URLs manually
2. **Import locale types** for full type safety
3. **Use the navigation helpers** for consistent URL building
4. **Test locale validation** as part of your test suite
5. **Log invalid attempts** in production for security monitoring
6. **Keep locale config centralized** for easy maintenance
7. **Document supported locales** in your README

## Common Patterns

### Pattern 1: Client Component with Locale
```typescript
const locale = useSafeLocale()
```

### Pattern 2: Server Component with Locale
```typescript
const { locale: rawLocale } = await params
const locale = getSafeLocale(rawLocale)
```

### Pattern 3: Navigation with Locale
```typescript
router.push(localizedPath('dashboard', locale))
```

### Pattern 4: API Calls with Locale
```typescript
const response = await fetch(`/api/data?locale=${locale}`)
```

This implementation ensures security, type safety, and maintainability across the entire application.