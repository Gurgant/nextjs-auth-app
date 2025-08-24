# Secure Locale Implementation - Best Practices

## Executive Summary

This document outlines best practices for implementing secure locale handling in our Next.js application. Following these practices ensures security, type safety, and maintainability.

## Core Principles

### 1. Never Trust User Input

- Always validate locale values against a whitelist
- Assume all URL parameters can be manipulated
- Use framework-provided validation when available

### 2. Single Source of Truth

- Centralize locale configuration in `/src/config/i18n.ts`
- Import locale constants from one location
- Avoid hardcoding locale values

### 3. Type Safety First

- Use TypeScript's const assertions for locale arrays
- Derive types from data, not the other way around
- Leverage type guards for runtime validation

### 4. Defense in Depth

- Validate at multiple layers (client, server, middleware)
- Fail safely to default values
- Log suspicious activity

## Implementation Best Practices

### ✅ DO: Use the Secure Hooks and Helpers

```typescript
// ✅ Good - using the secure hook
import { useSafeLocale } from "@/hooks/use-safe-locale";

export function MyComponent() {
  const locale = useSafeLocale();
  // locale is guaranteed valid
}
```

### ❌ DON'T: Parse URLs Manually

```typescript
// ❌ Bad - manual URL parsing
const locale = window.location.pathname.split("/")[1];

// ❌ Bad - no validation
const locale = params.locale || "en";
```

### ✅ DO: Validate Server-Side Locales

```typescript
// ✅ Good - server component with validation
import { getSafeLocale } from "@/config/i18n";

export default async function Page({ params }: Props) {
  const { locale: rawLocale } = await params;
  const locale = getSafeLocale(rawLocale);
}
```

### ❌ DON'T: Trust Client-Side Values

```typescript
// ❌ Bad - trusting query parameters
const locale = searchParams.get("locale") || "en";

// ❌ Bad - using unvalidated form data
const locale = formData.get("locale") as string;
```

### ✅ DO: Use Type-Safe Navigation

```typescript
// ✅ Good - type-safe navigation
import { localizedPath } from "@/utils/navigation";

router.push(localizedPath("dashboard", locale));
```

### ❌ DON'T: Build URLs with String Concatenation

```typescript
// ❌ Bad - error prone
router.push("/" + locale + "/dashboard");

// ❌ Bad - no type safety
router.push(`/${locale}/dashboard`);
```

## Security Checklist

### Component Development

- [ ] Import locale types from centralized config
- [ ] Use `useSafeLocale()` hook in client components
- [ ] Use `getSafeLocale()` in server components
- [ ] Never parse `window.location` directly
- [ ] Validate all locale inputs

### Code Review

- [ ] Check for manual URL parsing
- [ ] Verify locale validation is present
- [ ] Ensure type safety throughout
- [ ] Look for string concatenation in URLs
- [ ] Confirm error handling for invalid locales

### Testing

- [ ] Test with invalid locale values
- [ ] Test with missing locale parameters
- [ ] Test with malicious inputs (XSS attempts)
- [ ] Test fallback behavior
- [ ] Test edge cases (empty strings, special characters)

## Common Patterns

### Pattern 1: Client Component with Locale

```typescript
'use client'
import { useSafeLocale } from '@/hooks/use-safe-locale'

export function ClientComponent() {
  const locale = useSafeLocale()

  return <div>Current locale: {locale}</div>
}
```

### Pattern 2: Server Component with Locale

```typescript
import { getSafeLocale } from '@/config/i18n'

interface Props {
  params: Promise<{ locale: string }>
}

export default async function ServerComponent({ params }: Props) {
  const { locale: rawLocale } = await params
  const locale = getSafeLocale(rawLocale)

  return <div>Server locale: {locale}</div>
}
```

### Pattern 3: API Route with Locale

```typescript
import { getSafeLocale } from "@/config/i18n";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const locale = getSafeLocale(searchParams.get("locale"));

  // Use validated locale
}
```

### Pattern 4: Form Action with Locale

```typescript
import { getSafeLocale } from "@/config/i18n";

export async function submitForm(formData: FormData) {
  const locale = getSafeLocale(formData.get("locale"));

  // Process with validated locale
}
```

## Migration Strategy

### Phase 1: Setup (Day 1)

1. Create centralized config
2. Implement secure hooks
3. Add navigation utilities
4. Write tests

### Phase 2: High-Risk Components (Day 2-3)

1. Authentication pages
2. Error pages
3. Security-sensitive forms
4. Payment/checkout flows

### Phase 3: General Migration (Week 1)

1. Dashboard components
2. Profile/settings pages
3. Public pages
4. API routes

### Phase 4: Validation (Week 2)

1. Add middleware protection
2. Implement logging
3. Performance testing
4. Security audit

## Performance Considerations

### Optimization Tips

1. **Memoize locale validation** in frequently rendered components
2. **Use React Context** for locale if passed through many levels
3. **Lazy load** locale-specific data
4. **Cache validation results** when appropriate

### Example with Memoization

```typescript
import { useMemo } from 'react'
import { useSafeLocale } from '@/hooks/use-safe-locale'

export function PerformantComponent() {
  const locale = useSafeLocale()

  const expensiveComputation = useMemo(() => {
    return computeLocaleSpecificData(locale)
  }, [locale])

  return <div>{expensiveComputation}</div>
}
```

## Monitoring and Alerts

### What to Monitor

1. **Invalid locale attempts** - Could indicate attacks
2. **Locale validation failures** - May reveal bugs
3. **Performance metrics** - Validation overhead
4. **Error rates** - Locale-related errors

### Logging Example

```typescript
const locale = getSafeLocale(value, {
  logInvalid: true,
  source: "UserProfile",
});

// In production, send to monitoring service
if (process.env.NODE_ENV === "production") {
  trackSecurityEvent("invalid_locale_attempt", {
    attempted: value,
    source: "UserProfile",
    timestamp: new Date().toISOString(),
  });
}
```

## Common Mistakes to Avoid

### 1. Forgetting Validation in New Components

**Solution**: Make locale validation part of component templates

### 2. Mixing Validated and Unvalidated Locales

**Solution**: Use TypeScript types to distinguish

### 3. Hardcoding Locale Values

**Solution**: Always import from central config

### 4. Ignoring Edge Cases

**Solution**: Test with empty strings, null, undefined

### 5. Over-Engineering

**Solution**: Keep it simple - validate, use, done

## Quick Reference

### Import Statements

```typescript
// For client components
import { useSafeLocale } from "@/hooks/use-safe-locale";

// For server components and utilities
import { getSafeLocale, type Locale } from "@/config/i18n";

// For navigation
import { localizedPath } from "@/utils/navigation";
```

### Common Operations

```typescript
// Get validated locale in client component
const locale = useSafeLocale();

// Get validated locale in server component
const locale = getSafeLocale(params.locale);

// Navigate with locale
router.push(localizedPath("dashboard", locale));

// Check if value is valid locale
if (isValidLocale(someValue)) {
  // someValue is now typed as Locale
}
```

## Conclusion

Secure locale handling is critical for:

- **Security**: Preventing injection attacks
- **Reliability**: Consistent behavior
- **Maintainability**: Easy to update supported locales
- **Developer Experience**: Type safety and clear patterns

Follow these practices consistently, and locale handling will be both secure and maintainable.

## Resources

- [Implementation Guide](./secure-locale-implementation-guide.md)
- [Security Analysis](./security-locale-extraction.md)
- [Next.js Internationalization](https://nextjs.org/docs/app/building-your-application/routing/internationalization)
- [OWASP Input Validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
