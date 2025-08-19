# Secure Locale Implementation - Comprehensive Action Plan

## 🎯 Executive Summary

Implementing secure locale handling to prevent security vulnerabilities from URL manipulation. Current progress: Core infrastructure complete, 8 components migrated, critical issues identified.

## 📊 Current Status

### ✅ Completed (Phase 8.0 - 8.4)
1. **Core Infrastructure**
   - Created `/src/config/i18n.ts` with whitelist validation
   - Implemented `useSafeLocale()` hook
   - Created type-safe navigation utilities
   - Updated middleware with security features

2. **Component Migration (8 components)**
   - ✅ Auth error page
   - ✅ Sign-in button
   - ✅ Credentials form
   - ✅ Dashboard content
   - ✅ Sign-in page
   - ✅ Language selector
   - ✅ Registration form (type)
   - ✅ OAuth account linking

3. **Security Headers**
   - ✅ Added to `next.config.ts`
   - ⏳ Requires server restart to test

### 🚧 In Progress (Phase 8.5 - 8.6)
1. **Critical Issues**
   - 🔴 NextAuth hardcoded `/en/` paths
   - 🟡 Auth error redirect not working
   - 🟡 Two-factor verification using `window.location`
   - 🟡 Verify-email page has hardcoded English text

### ⏳ Pending (Phase 8.7 - 8.8)
1. Testing suite
2. Documentation
3. Monitoring setup

## 🚀 Immediate Actions Required

### Priority 1: Fix NextAuth Locale Issue (Critical)
```typescript
// Current problem in auth.ts
pages: {
  signIn: "/en/auth/signin",  // Hardcoded!
  error: "/en/auth/error",    // Hardcoded!
}
```

**Solution**: Enhance middleware to intercept and rewrite auth URLs
1. Detect `/en/auth/*` requests in middleware
2. Extract user's actual locale from cookie/header
3. Rewrite URL to correct locale
4. Add security logging

### Priority 2: Complete Component Migration
1. **Two-factor verification** - Replace `window.location.href`
2. **Verify-email page** - Add i18n for hardcoded text
3. **Link-account pages** - Check for locale issues
4. **Password reset components** - Audit and migrate

### Priority 3: Fix Middleware Issues
1. Test security headers after server restart
2. Debug auth error redirect logic
3. Add comprehensive logging

## 📋 Detailed Execution Plan

### Step 1: Fix NextAuth Hardcoded Paths (30 mins)
```typescript
// In middleware.ts, add auth URL interception
function handleAuthRoutes(request: NextRequest, locale: Locale): NextResponse | null {
  const pathname = request.nextUrl.pathname
  
  // Intercept hardcoded /en/auth/* paths
  if (pathname.startsWith('/en/auth/')) {
    const actualLocale = extractLocaleFromRequest(request).locale
    if (actualLocale !== 'en') {
      const newPath = pathname.replace('/en/', `/${actualLocale}/`)
      return NextResponse.redirect(new URL(newPath, request.url))
    }
  }
  
  return null
}
```

### Step 2: Update Two-Factor Verification (20 mins)
```typescript
// Replace window.location.href with router navigation
import { useRouter } from 'next/navigation'
import { useSafeLocale } from '@/hooks/use-safe-locale'

// In component:
const router = useRouter()
const locale = useSafeLocale()

// Instead of: window.location.href = finalCallbackUrl
router.push(finalCallbackUrl)
```

### Step 3: Add i18n to Verify-Email Page (15 mins)
- Replace hardcoded "Email Verified Successfully!"
- Replace "Go to Dashboard" button text
- Replace error messages
- Use translation keys

### Step 4: Complete Remaining Scans (45 mins)
1. Search for remaining hardcoded paths
2. Check all redirect() server-side calls
3. Audit API routes for locale handling
4. Check email templates

### Step 5: Implement Tests (60 mins)
1. Unit tests for locale utilities
2. Integration tests for middleware
3. Security tests for malicious inputs
4. E2E tests for locale switching

### Step 6: Documentation (30 mins)
1. Update secure locale migration guide
2. Create troubleshooting guide
3. Document best practices
4. Add to CLAUDE.md

## 🛡️ Security Checklist

- [ ] All locale inputs validated against whitelist
- [ ] No direct URL parsing without validation
- [ ] Security events logged for monitoring
- [ ] Path traversal attempts blocked
- [ ] XSS injection prevented
- [ ] Type safety enforced

## 📈 Success Metrics

1. **Zero unsafe locale extractions** in codebase
2. **All auth flows** respect user locale
3. **Security headers** applied to all responses
4. **100% test coverage** for locale utilities
5. **Complete documentation** for team

## 🚨 Risk Mitigation

1. **Backup Strategy**: All changes documented, rollback procedures ready
2. **Testing**: Manual testing with all 5 locales before production
3. **Monitoring**: Security logs for invalid locale attempts
4. **Gradual Rollout**: Test in staging environment first

## 📅 Timeline

- **Today**: Fix critical issues (NextAuth, 2FA, headers)
- **Tomorrow**: Complete component migration and testing
- **Day 3**: Documentation and monitoring setup

## 🏆 Best Practices Moving Forward

1. **Always use `useSafeLocale()`** in client components
2. **Validate locale** in server actions/API routes
3. **Import `Locale` type** for all locale parameters
4. **Use `localizedPath()`** for creating URLs
5. **Log security events** for monitoring
6. **Test with malicious inputs** regularly
7. **Review locale handling** in code reviews
8. **Update documentation** with new patterns

## 🔧 Technical Debt to Address

1. NextAuth static locale configuration
2. Email templates with hardcoded locales
3. Test coverage for locale edge cases
4. Performance optimization for locale validation
5. Monitoring dashboard for security events

## 📞 Next Steps

1. **Immediate**: Fix NextAuth hardcoded paths in middleware
2. **Next Hour**: Complete component migrations
3. **End of Day**: Test all changes with server restart
4. **Tomorrow**: Complete testing and documentation

This plan ensures systematic completion of the secure locale implementation while maintaining security and code quality.