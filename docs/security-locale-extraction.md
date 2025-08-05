# Security Analysis: Locale Extraction from URL

## Overview

This document analyzes the security implications of extracting locale values from URLs in a Next.js application and provides secure implementation patterns.

## Current Implementation Analysis

```typescript
const pathname = window.location.pathname
const locale = pathname.split('/')[1] || 'en'
```

### Security Risk Assessment

#### 1. Input Source Analysis
- `window.location.pathname` comes from the browser's URL
- Users can manually modify URLs
- This is client-side code (indicated by `'use client'` directive)

#### 2. Potential Attack Vectors

**URL Manipulation Examples:**
```
https://example.com/../../../../etc/passwd/page
https://example.com/<script>alert('xss')</script>/page
https://example.com/en%2F..%2F..%2Fadmin/page
https://example.com/'; DROP TABLE users; --/page
```

#### 3. Current Usage Context
```typescript
// Locale is only used for navigation
router.push(`/${locale}`)
router.push(`/${locale}/dashboard`)
```

### Risk Analysis

#### Low Risk Factors:
1. **No Direct HTML Injection**: The locale value isn't rendered directly in JSX/HTML
2. **Router Protection**: Next.js `router.push()` has built-in URL validation
3. **Limited Scope**: Only used for navigation, not database queries or file system access
4. **Client-Side Only**: No server-side execution with this value

#### Potential Concerns:
1. **Invalid Locales**: Could result in 404s or unexpected navigation
2. **Path Traversal**: Attempts like `../../../admin` would create invalid routes
3. **URL Encoding**: Special characters could create malformed URLs
4. **Logging**: If this locale is logged, it could pollute logs

### Risk Level: LOW-MEDIUM

The current implementation is not immediately dangerous because:
- Next.js router validates URLs before navigation
- No direct rendering of the locale value
- Limited to client-side navigation only

However, it violates the principle of "never trust user input" and could become a vulnerability if:
- The locale value is used for anything beyond navigation
- The code is refactored to use locale in API calls
- The locale is logged or stored without sanitization

## Secure Implementation Patterns

### Option 1: Whitelist Validation (Most Secure)
```typescript
// Define allowed locales (could import from i18n config)
const ALLOWED_LOCALES = ['en', 'fr', 'es', 'de'] as const
type Locale = typeof ALLOWED_LOCALES[number]

// Extract and validate
const pathname = window.location.pathname
const extractedLocale = pathname.split('/')[1]
const locale: Locale = ALLOWED_LOCALES.includes(extractedLocale as Locale) 
  ? extractedLocale as Locale 
  : 'en'
```

### Option 2: Pattern Matching
```typescript
// Only accept 2-letter language codes
const pathname = window.location.pathname
const localeMatch = pathname.match(/^\/([a-z]{2})(?:\/|$)/)
const locale = localeMatch?.[1] || 'en'
```

### Option 3: Use Next.js Built-in Methods
```typescript
// Better: Get locale from Next.js router
import { useParams } from 'next/navigation'

// In component
const params = useParams()
const locale = params.locale as string || 'en'
```

### Option 4: Centralized Locale Extraction
```typescript
// utils/locale.ts
export function extractLocaleFromPath(pathname: string): string {
  const LOCALE_REGEX = /^\/([a-z]{2}(?:-[A-Z]{2})?)(?:\/|$)/
  const match = pathname.match(LOCALE_REGEX)
  
  if (!match) return 'en'
  
  const extractedLocale = match[1]
  const supportedLocales = ['en', 'fr', 'es', 'de', 'en-US', 'en-GB']
  
  return supportedLocales.includes(extractedLocale) ? extractedLocale : 'en'
}

// Usage
const locale = extractLocaleFromPath(window.location.pathname)
```

### Option 5: Use URL API with Validation
```typescript
// Parse URL properly
const url = new URL(window.location.href)
const pathSegments = url.pathname.split('/').filter(Boolean)
const possibleLocale = pathSegments[0]

// Validate against i18n config
import { locales } from '@/i18n/config'
const locale = locales.includes(possibleLocale) ? possibleLocale : 'en'
```

### Option 6: Server-Side Props (Most Secure)
```typescript
// Convert to server component and get locale from params
interface Props {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ error?: string }>
}

export default async function AuthErrorPage({ params, searchParams }: Props) {
  const { locale } = await params
  const { error } = await searchParams
  
  // Now locale is guaranteed safe by Next.js routing
}
```

## Why These Approaches Are Better

1. **Whitelist Validation**: Only accepts known-good values
2. **Pattern Matching**: Ensures locale follows expected format
3. **Framework Integration**: Uses Next.js's validated params
4. **Centralized Logic**: Single source of truth for locale extraction
5. **URL API**: Proper URL parsing instead of string splitting
6. **Server-Side**: Completely avoids client-side manipulation

## Key Security Principles

- Never trust raw user input
- Validate against a known set of values
- Use framework-provided methods when available
- Fail safely to a default value
- Consider server-side alternatives for sensitive operations

## Next.js Routing and Locale Handling

### How Next.js Routing Works

Next.js App Router uses a file-system based routing mechanism where:

1. **Directory Structure = URL Structure**
   ```
   app/
   ├── [locale]/
   │   ├── page.tsx         → /en, /fr, /es
   │   ├── about/
   │   │   └── page.tsx     → /en/about, /fr/about
   │   └── products/
   │       └── [id]/
   │           └── page.tsx → /en/products/123
   ```

2. **Dynamic Segments**
   - `[locale]` - Dynamic segment that matches any value
   - `[...slug]` - Catch-all segment
   - `[[...slug]]` - Optional catch-all segment

3. **Route Validation**
   - Next.js validates routes at build time
   - Dynamic segments are validated against the file system
   - Invalid routes return 404

### Understanding `useParams`

```typescript
import { useParams } from 'next/navigation'
```

#### What is `useParams`?

`useParams` is a Client Component hook that lets you read the dynamic params from the current URL.

#### How it Works:

1. **Extracts Dynamic Route Parameters**
   ```typescript
   // For URL: /en/products/123
   // With route: /[locale]/products/[id]/page.tsx
   
   const params = useParams()
   // params = { locale: 'en', id: '123' }
   ```

2. **Type Safety**
   ```typescript
   // You can type the params
   const params = useParams<{ locale: string; id: string }>()
   ```

3. **Why It's Secure**
   - Parameters are extracted by Next.js routing system
   - They must match the file system structure
   - No arbitrary values can be injected
   - Values are already validated against existing routes

#### Example Usage:

```typescript
'use client'

import { useParams } from 'next/navigation'

export default function ProductPage() {
  const params = useParams()
  const locale = params.locale as string
  const productId = params.id as string
  
  // These values are guaranteed to match the route pattern
  // If they didn't, Next.js wouldn't have routed here
}
```

#### Server Component Alternative:

```typescript
// Server components receive params as props
interface Props {
  params: Promise<{ locale: string; id: string }>
}

export default async function ProductPage({ params }: Props) {
  const { locale, id } = await params
  // Already validated by Next.js routing
}
```

### Why Next.js Routing is Secure

1. **Build-Time Validation**: Routes are validated when the app builds
2. **No Arbitrary Execution**: Can't inject random paths that execute code
3. **Automatic 404**: Invalid routes automatically return 404
4. **Parameter Sanitization**: Dynamic segments are extracted safely
5. **Type Safety**: TypeScript can enforce parameter types

### Comparison: Manual Extraction vs useParams

```typescript
// ❌ Manual extraction - risky
const pathname = window.location.pathname
const locale = pathname.split('/')[1] // Could be anything!

// ✅ useParams - secure
const params = useParams()
const locale = params.locale // Guaranteed to match route pattern
```

### Best Practices

1. **Always prefer `useParams` or server-side params** over manual URL parsing
2. **Define locale types** to ensure type safety
3. **Use middleware** for locale validation if needed
4. **Centralize locale configuration** in one place
5. **Never trust client-side URL manipulation** for security-critical decisions