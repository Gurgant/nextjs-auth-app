# Middleware Best Practices for Next.js

## Overview

Middleware in Next.js runs before every request is completed. This makes it powerful but also dangerous if not implemented correctly. This guide provides best practices for secure, performant middleware.

## 🏗️ Architecture Principles

### 1. Single Middleware File
Next.js supports only ONE middleware file. Always use:
- `/middleware.ts` (recommended location)
- Never create multiple middleware files

### 2. Early Returns
Minimize processing by returning early:
```typescript
export function middleware(request: NextRequest) {
  // Skip static assets immediately
  if (request.nextUrl.pathname.startsWith('/_next')) {
    return NextResponse.next()
  }
  
  // Skip API routes if not needed
  if (request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next()
  }
  
  // Process only what's necessary
}
```

### 3. Proper Matcher Configuration
```typescript
export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon.ico|robots.txt).*)',
    // Include root
    '/'
  ]
}
```

## 🔒 Security Best Practices

### 1. Never Trust User Input
```typescript
// ❌ BAD - Trusts user input
const locale = pathname.split('/')[1]

// ✅ GOOD - Validates input
const possibleLocale = pathname.split('/')[1]
const locale = ALLOWED_LOCALES.includes(possibleLocale) ? possibleLocale : DEFAULT_LOCALE
```

### 2. Validate All Parameters
```typescript
// Create validation functions
function isValidLocale(value: unknown): boolean {
  return typeof value === 'string' && ALLOWED_LOCALES.includes(value)
}

function isValidRedirect(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ALLOWED_ORIGINS.includes(parsed.origin)
  } catch {
    return false
  }
}
```

### 3. Prevent Open Redirects
```typescript
// ❌ BAD - Open redirect vulnerability
const redirectTo = searchParams.get('redirect')
return NextResponse.redirect(redirectTo)

// ✅ GOOD - Validated redirect
const redirectTo = searchParams.get('redirect')
if (redirectTo && isValidRedirect(redirectTo)) {
  return NextResponse.redirect(redirectTo)
}
return NextResponse.redirect('/default-page')
```

### 4. Add Security Headers
```typescript
export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  
  // Security headers
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  
  return response
}
```

## ⚡ Performance Best Practices

### 1. Minimize Processing
```typescript
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Use early returns
  if (pathname.startsWith('/api')) return
  if (pathname.startsWith('/_next')) return
  if (pathname.includes('.')) return // Skip files
  
  // Expensive operations only when needed
  const locale = expensiveLocaleExtraction(pathname)
}
```

### 2. Avoid Async Operations
```typescript
// ❌ BAD - Async operations block every request
export async function middleware(request: NextRequest) {
  const data = await fetch('https://api.example.com/check')
  // This will slow down EVERY request
}

// ✅ GOOD - Use edge-compatible operations
export function middleware(request: NextRequest) {
  // Synchronous operations only
  const result = performSyncCheck(request)
}
```

### 3. Cache Computed Values
```typescript
// Cache regex compilation
const LOCALE_REGEX = /^\/([a-z]{2})(?:\/|$)/

// Cache allowed values as Set for O(1) lookup
const ALLOWED_LOCALES_SET = new Set(['en', 'es', 'fr', 'it', 'de'])

export function middleware(request: NextRequest) {
  const match = request.nextUrl.pathname.match(LOCALE_REGEX)
  if (match && ALLOWED_LOCALES_SET.has(match[1])) {
    // Process locale
  }
}
```

## 🧪 Testing Middleware

### 1. Unit Tests
```typescript
import { middleware } from '../middleware'
import { NextRequest } from 'next/server'

describe('Middleware', () => {
  it('validates locales correctly', () => {
    const request = new NextRequest('http://localhost/fr/page')
    const response = middleware(request)
    expect(response.headers.get('x-locale')).toBe('fr')
  })
  
  it('rejects invalid locales', () => {
    const request = new NextRequest('http://localhost/xxx/page')
    const response = middleware(request)
    expect(response.redirected).toBe(true)
    expect(response.url).toContain('/en/')
  })
})
```

### 2. Edge Cases to Test
```typescript
const edgeCases = [
  '/../../etc/passwd',
  '/<script>alert("xss")</script>/page',
  '/\x00/null-byte',
  '/%2e%2e%2f/encoded',
  '/'.repeat(1000), // Long path
  '', // Empty path
]

edgeCases.forEach(path => {
  it(`handles edge case: ${path}`, () => {
    const request = new NextRequest(`http://localhost${path}`)
    expect(() => middleware(request)).not.toThrow()
  })
})
```

## 📊 Monitoring and Logging

### 1. Structured Logging
```typescript
function logSecurityEvent(event: {
  type: string
  value: unknown
  request: NextRequest
}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    type: event.type,
    value: event.value,
    ip: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
    path: request.nextUrl.pathname
  }))
}
```

### 2. Performance Tracking
```typescript
export function middleware(request: NextRequest) {
  const start = Date.now()
  
  try {
    // Middleware logic
    return response
  } finally {
    const duration = Date.now() - start
    if (duration > 50) { // Log slow middleware
      console.warn(`Slow middleware execution: ${duration}ms`)
    }
  }
}
```

## 🚫 Common Mistakes to Avoid

### 1. Multiple Middleware Files
```typescript
// ❌ BAD - Only one will work
/middleware.ts
/src/middleware.ts
/app/middleware.ts

// ✅ GOOD - Single middleware
/middleware.ts
```

### 2. Blocking Operations
```typescript
// ❌ BAD - Blocks all requests
export async function middleware() {
  await new Promise(resolve => setTimeout(resolve, 1000))
}

// ✅ GOOD - Non-blocking
export function middleware() {
  // Fast, synchronous operations only
}
```

### 3. Unhandled Errors
```typescript
// ❌ BAD - Crashes on error
export function middleware(request: NextRequest) {
  const locale = request.nextUrl.pathname.split('/')[1]
  return localeConfig[locale] // Might throw
}

// ✅ GOOD - Error handling
export function middleware(request: NextRequest) {
  try {
    const locale = extractLocale(request)
    return processLocale(locale)
  } catch (error) {
    console.error('Middleware error:', error)
    return NextResponse.next()
  }
}
```

## 📝 Middleware Checklist

Before deploying middleware:

### Security
- [ ] All user inputs validated
- [ ] No open redirects possible
- [ ] Security headers added
- [ ] Error handling implemented
- [ ] Logging for suspicious activity

### Performance
- [ ] Early returns for static assets
- [ ] No async/blocking operations
- [ ] Regex patterns cached
- [ ] Execution time < 50ms

### Testing
- [ ] Unit tests written
- [ ] Edge cases covered
- [ ] Performance benchmarked
- [ ] Error scenarios tested
- [ ] Redirect loops prevented

### Monitoring
- [ ] Logging implemented
- [ ] Metrics tracked
- [ ] Alerts configured
- [ ] Error reporting setup

## 🔄 Deployment Strategy

### 1. Staged Rollout
```typescript
// Feature flag approach
export function middleware(request: NextRequest) {
  const useNewMiddleware = process.env.USE_NEW_MIDDLEWARE === 'true'
  
  if (useNewMiddleware) {
    return newMiddlewareLogic(request)
  }
  
  return oldMiddlewareLogic(request)
}
```

### 2. Canary Deployment
- Deploy to 5% of traffic
- Monitor for 24 hours
- Gradually increase to 100%

### 3. Rollback Plan
Always have a quick rollback:
```bash
# Rollback script
git revert HEAD
git push origin main --force-with-lease
```

## 📚 Additional Resources

- [Next.js Middleware Documentation](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [Edge Runtime API](https://nextjs.org/docs/app/api-reference/edge)
- [Web Security Cheat Sheet](https://cheatsheetseries.owasp.org/)
- [Performance Best Practices](https://web.dev/performance/)

---

Remember: Middleware affects EVERY request. Write it carefully, test it thoroughly, and monitor it closely.