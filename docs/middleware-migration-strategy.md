# Middleware Migration Strategy - CRITICAL

## ⚠️ Current Situation Analysis

### Critical Finding: Duplicate Middleware Files

We have discovered **TWO middleware files** in the project:

1. `/middleware.ts` - Handles OAuth/Auth error redirects
   - Uses UNSAFE locale extraction: `pathname.split('/')[1] || 'en'`
   - Redirects auth errors to error page
2. `/src/middleware.ts` - Handles i18n with next-intl
   - Uses next-intl for locale management
   - Skips API routes

**PROBLEM**: Next.js only supports ONE middleware file. Having two can cause:

- Unpredictable behavior
- One middleware being ignored
- Deployment issues
- Performance problems

## 🚨 Risk Assessment

### High Risk Areas

1. **Security Vulnerability**
   - Current middleware uses unsafe locale extraction
   - No validation against allowed locales
   - Potential for URL manipulation

2. **Functionality Conflict**
   - Two middleware files may conflict
   - Unclear which one is actually running
   - Could break at any Next.js update

3. **Production Impact**
   - Middleware runs on EVERY request
   - Errors affect entire application
   - Can create redirect loops
   - Performance degradation

## 📋 Migration Strategy

### Phase 0: Analysis and Backup (CRITICAL - DO FIRST)

#### Step 1: Determine Active Middleware

```bash
# Check which middleware is actually being used
pnpm build
# Look for middleware compilation output

# Test current behavior
curl -I http://localhost:3000/invalid-locale/page
curl -I http://localhost:3000/en/auth/signin?error=OAuthAccountNotLinked
```

#### Step 2: Create Comprehensive Backups

```bash
# Create backup directory
mkdir -p backups/middleware/$(date +%Y%m%d_%H%M%S)

# Backup both files
cp middleware.ts backups/middleware/$(date +%Y%m%d_%H%M%S)/
cp src/middleware.ts backups/middleware/$(date +%Y%m%d_%H%M%S)/

# Create git commit
git add -A
git commit -m "backup: Middleware files before security migration"

# Create a branch for safe experimentation
git checkout -b fix/secure-middleware-migration
```

#### Step 3: Document Current Behavior

Create a test checklist:

- [ ] OAuth error redirects work
- [ ] Locale routing works
- [ ] API routes are accessible
- [ ] Static files load correctly
- [ ] No redirect loops

### Phase 1: Create Unified Middleware Plan

#### Design Principles

1. **Single Middleware File** - Consolidate all logic
2. **Secure Locale Handling** - Use validated extraction
3. **Preserve Functionality** - Keep all current features
4. **Add Monitoring** - Log security events

#### Proposed Architecture

```typescript
// middleware.ts (unified)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { ALLOWED_LOCALES, DEFAULT_LOCALE, isValidLocale } from "@/config/i18n";

// Create i18n middleware
const intlMiddleware = createIntlMiddleware({
  locales: ALLOWED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
});

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Skip API routes
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Extract and validate locale
  const pathSegments = pathname.split("/").filter(Boolean);
  const possibleLocale = pathSegments[0];
  const locale = isValidLocale(possibleLocale)
    ? possibleLocale
    : DEFAULT_LOCALE;

  // Handle OAuth/Auth errors
  if (searchParams.has("error")) {
    const error = searchParams.get("error");

    if (
      pathname.includes("/auth/signin") ||
      pathname.includes("/auth/callback") ||
      pathname.includes("/api/auth/")
    ) {
      console.log(`🚨 Auth error redirect: ${error} for locale: ${locale}`);

      return NextResponse.redirect(
        new URL(`/${locale}/auth/error?error=${error}`, request.url),
      );
    }
  }

  // Apply i18n middleware
  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)", "/"],
};
```

### Phase 2: Incremental Implementation

#### Step 1: Create Test Middleware

```bash
# Create new middleware for testing
cp middleware.ts middleware.backup.ts
touch middleware.new.ts
```

#### Step 2: Implement Secure Version

1. Add locale validation
2. Merge both middleware logics
3. Add comprehensive logging
4. Add error boundaries

#### Step 3: Test Extensively

```typescript
// middleware.test.ts
describe("Unified Middleware", () => {
  test("validates locales securely", () => {
    // Test with valid locales
    // Test with invalid locales
    // Test with malicious inputs
  });

  test("handles auth errors correctly", () => {
    // Test OAuth error redirects
    // Test locale preservation
  });

  test("applies i18n correctly", () => {
    // Test locale routing
    // Test default locale
  });
});
```

### Phase 3: Deployment Strategy

#### Pre-Deployment Checklist

- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] Performance benchmarked
- [ ] Rollback plan ready
- [ ] Team notified

#### Deployment Steps

1. **Development Environment**

   ```bash
   # Test locally
   pnpm dev
   # Run all test scenarios
   ```

2. **Staging Environment**

   ```bash
   # Deploy to staging
   git push origin fix/secure-middleware-migration
   # Monitor for 24 hours
   ```

3. **Production Deployment**
   - Deploy during low traffic
   - Monitor error rates
   - Be ready to rollback

#### Rollback Plan

```bash
# If issues arise:
cp middleware.backup.ts middleware.ts
git add middleware.ts
git commit -m "rollback: Restore original middleware"
git push origin main
```

## 🛡️ Best Practices for Middleware

### DO's

1. **Always validate user input**
2. **Use type-safe locale extraction**
3. **Log security events**
4. **Test edge cases**
5. **Have rollback plan**
6. **Monitor performance**

### DON'Ts

1. **Don't parse URLs manually**
2. **Don't trust pathname.split()**
3. **Don't deploy without testing**
4. **Don't ignore TypeScript errors**
5. **Don't skip staging environment**

### Security Considerations

```typescript
// ❌ UNSAFE - Current approach
const locale = pathname.split("/")[1] || "en";

// ✅ SAFE - Validated approach
import { isValidLocale, DEFAULT_LOCALE } from "@/config/i18n";
const pathSegments = pathname.split("/").filter(Boolean);
const locale = isValidLocale(pathSegments[0])
  ? pathSegments[0]
  : DEFAULT_LOCALE;
```

## 📊 Testing Strategy

### Unit Tests

```typescript
// Test locale extraction
test("extracts valid locales", () => {
  const validPaths = ["/en/page", "/fr/page", "/es/page"];
  // Assert correct extraction
});

test("rejects invalid locales", () => {
  const invalidPaths = ["/xxx/page", "/../etc/passwd", "/<script>/page"];
  // Assert fallback to default
});
```

### Integration Tests

```typescript
// Test full request flow
test("middleware handles auth errors", async () => {
  const response = await fetch("/en/auth/signin?error=OAuthAccountNotLinked");
  expect(response.redirected).toBe(true);
  expect(response.url).toContain("/en/auth/error");
});
```

### Performance Tests

```bash
# Benchmark middleware performance
npx autocannon -c 100 -d 30 http://localhost:3000/en
```

## 🚀 Implementation Timeline

### Week 1: Foundation

- Day 1: Analysis and backup
- Day 2: Create secure utilities
- Day 3: Design unified middleware
- Day 4-5: Implementation and testing

### Week 2: Migration

- Day 1-2: Staging deployment
- Day 3-4: Monitor and fix issues
- Day 5: Production deployment

## 📝 Monitoring and Alerts

### What to Monitor

1. **Invalid locale attempts** (security)
2. **Redirect loops** (functionality)
3. **Response times** (performance)
4. **Error rates** (stability)

### Alert Thresholds

- Invalid locale attempts > 10/minute
- Response time > 100ms (p99)
- Error rate > 1%
- Redirect loops detected

## 🔍 Code Review Checklist

Before merging:

- [ ] No manual URL parsing
- [ ] Locale validation implemented
- [ ] All tests passing
- [ ] Performance acceptable
- [ ] No security vulnerabilities
- [ ] Documentation updated
- [ ] Team reviewed

## 📚 References

- [Next.js Middleware Docs](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [next-intl Middleware](https://next-intl-docs.vercel.app/docs/routing/middleware)
- [Security Best Practices](./secure-locale-best-practices.md)
- [Implementation Guide](./secure-locale-implementation-guide.md)

---

**Remember**: Middleware is critical infrastructure. Take time, test thoroughly, and always have a rollback plan.
