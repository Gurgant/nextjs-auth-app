# Unsafe Locale Extraction Audit Report

## Executive Summary

This audit identifies all instances of unsafe locale extraction from URLs in the codebase. These patterns pose security risks including path traversal, XSS vulnerabilities, and incorrect locale handling.

## Critical Findings

### 1. Middleware-Level Issues (CRITICAL)

#### `/middleware.ts` (Root Middleware)

- **Line 14**: `const locale = pathname.split('/')[1] || 'en'`
- **Risk Level**: CRITICAL
- **Impact**: All OAuth error redirects use unsafe locale extraction
- **Attack Surface**: Publicly accessible, affects authentication flow

### 2. Authentication Components (HIGH RISK)

#### `/src/app/[locale]/auth/error/page.tsx`

- **Lines 68-69**:
  ```typescript
  const pathname = window.location.pathname;
  const locale = pathname.split("/")[1] || "en";
  ```
- **Risk Level**: HIGH
- **Impact**: Auth error page - critical for security messaging

#### `/src/app/[locale]/auth/signin/page.tsx`

- **Lines 10, 13**:
  ```typescript
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  ```
- **Risk Level**: HIGH
- **Impact**: Sign-in page - entry point for authentication

#### `/src/components/auth/sign-in-button.tsx`

- **Lines 12, 15**:
  ```typescript
  const pathname = usePathname();
  const currentLocale = pathname.split("/")[1] || "en";
  ```
- **Risk Level**: HIGH
- **Impact**: Sign-in button used across the application

#### `/src/components/auth/credentials-form.tsx`

- **Lines 13, 21**:
  ```typescript
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  ```
- **Risk Level**: HIGH
- **Impact**: Credentials form - handles sensitive user input

### 3. General Components (MEDIUM RISK)

#### `/src/components/dashboard-content.tsx`

- **Lines 11-12**:
  ```typescript
  const pathname = usePathname();
  const currentLocale = pathname.split("/")[1] || "en";
  ```
- **Risk Level**: MEDIUM
- **Impact**: Dashboard content - protected route but still needs fixing

#### `/src/components/language-selector.tsx`

- **Line 50**: `const segments = pathname.split("/");`
- **Risk Level**: MEDIUM
- **Impact**: Language selector - affects locale switching

### 4. Server-Side Code (MEDIUM RISK)

#### `/src/lib/auth.ts`

- **Line 324**: `const segments = urlObj.pathname.split("/").filter(Boolean);`
- **Risk Level**: MEDIUM
- **Impact**: Auth library - server-side URL parsing

## Risk Prioritization

### Priority 1: CRITICAL (Immediate Action Required)

1. **Middleware** (`/middleware.ts`)
   - Affects all OAuth error handling
   - Entry point for attacks
   - Must be fixed before any component migrations

### Priority 2: HIGH (Authentication Components)

1. **Auth Error Page** (`/src/app/[locale]/auth/error/page.tsx`)
   - Handles sensitive error messages
   - User-facing error display
2. **Sign-in Page** (`/src/app/[locale]/auth/signin/page.tsx`)
   - Authentication entry point
   - High visibility component

3. **Sign-in Button** (`/src/components/auth/sign-in-button.tsx`)
   - Used across application
   - Authentication trigger

4. **Credentials Form** (`/src/components/auth/credentials-form.tsx`)
   - Handles user credentials
   - Form submission with locale

### Priority 3: MEDIUM (General Components)

1. **Dashboard Content** (`/src/components/dashboard-content.tsx`)
   - Protected route
   - Lower attack surface

2. **Language Selector** (`/src/components/language-selector.tsx`)
   - Locale switching logic
   - User interaction component

3. **Auth Library** (`/src/lib/auth.ts`)
   - Server-side processing
   - URL construction logic

## Attack Vectors

### 1. Path Traversal

```
/../../../../etc/passwd/dashboard
Result: locale = ".." (potentially dangerous)
```

### 2. XSS Injection

```
/<script>alert('xss')</script>/dashboard
Result: locale = "<script>alert('xss')</script>"
```

### 3. Invalid Locale Handling

```
/invalid-locale/dashboard
Result: locale = "invalid-locale" (not in allowed list)
```

## Migration Strategy

### Phase 1: Create Infrastructure ✅ (COMPLETED)

- Created `/src/config/i18n.ts` with validation
- Created `/src/hooks/use-safe-locale.ts`
- Created `/src/utils/navigation.ts`
- All with comprehensive tests

### Phase 2: Fix Critical Components (CURRENT)

1. Middleware consolidation and secure implementation
2. Auth error page migration
3. Sign-in page migration
4. Authentication component updates

### Phase 3: Complete Migration

1. Dashboard and protected routes
2. Utility components
3. Server-side locale handling

## Recommendations

1. **Immediate Actions**:
   - Begin middleware migration (highest priority)
   - Update auth error page (user-facing errors)
   - Fix sign-in flow components

2. **Security Best Practices**:
   - Always validate locale against whitelist
   - Use `useSafeLocale()` hook in client components
   - Use `getSafeLocale()` in server components
   - Never trust URL parsing without validation

3. **Testing Requirements**:
   - Test each component after migration
   - Verify locale switching works correctly
   - Test with invalid/malicious locale values
   - Ensure error messages display in correct locale

## Next Steps

1. Complete documentation of this audit report ✅
2. Prioritize components by risk level ✅
3. Begin migration starting with middleware
4. Update each component systematically
5. Test thoroughly after each migration
6. Deploy with monitoring and rollback plan

## Tracking

All unsafe instances have been documented. Migration progress will be tracked in the todo list under Phase 8, Subphases 8.3-8.4.
