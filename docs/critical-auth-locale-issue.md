# Critical Auth Locale Issue

## Problem

The NextAuth.js configuration in `/src/lib/auth.ts` has hardcoded English locale paths:

```typescript
pages: {
  signIn: "/en/auth/signin",
  error: "/en/auth/error",
},
```

This means all authentication redirects will go to English pages regardless of the user's current locale.

## Impact

- Users in non-English locales will be redirected to English pages on auth errors
- This breaks the locale consistency and user experience
- Security implications: users might not understand error messages in wrong language

## Challenge

NextAuth.js doesn't support dynamic locale paths in the `pages` configuration. The paths must be static strings.

## Potential Solutions

### Solution 1: Remove custom pages and handle in middleware

- Remove the `pages` configuration from NextAuth
- Let NextAuth use default pages
- Handle redirects in middleware based on locale

### Solution 2: Use middleware to intercept and redirect

- Keep the current configuration
- Add middleware logic to intercept `/en/auth/*` paths
- Redirect to correct locale based on cookie or header

### Solution 3: Create custom auth pages that detect locale

- Create pages at `/en/auth/*` that auto-detect and redirect
- Use client-side locale detection
- Redirect to appropriate locale

### Solution 4: Extend NextAuth with custom logic

- Override NextAuth redirect behavior
- Implement custom redirect logic in callbacks
- More complex but most flexible

## Recommendation

**Solution 2** seems most practical:

1. Keep current NextAuth config (avoiding breaking changes)
2. Enhance middleware to intercept auth redirects
3. Replace `/en/` with detected locale
4. Maintain security and type safety

## Implementation Plan

1. Update middleware to detect auth page redirects
2. Extract target locale from cookie/header
3. Rewrite the URL to use correct locale
4. Add logging for security monitoring
5. Test with all locales

## Security Considerations

- Validate locale before redirect (prevent open redirect)
- Log all auth redirects for monitoring
- Ensure consistent behavior across all auth flows
- Test error scenarios thoroughly
