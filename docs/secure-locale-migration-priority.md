# Secure Locale Migration Priority List

## Migration Order & Strategy

This document outlines the prioritized migration order for implementing secure locale handling across the application. Components are ordered by risk level and dependencies.

## CRITICAL PRIORITY - Middleware (Must be done first)

### 1. Root Middleware (`/middleware.ts`)

- **Current Issue**: Uses `pathname.split('/')[1] || 'en'`
- **Impact**: All OAuth error redirects
- **Dependencies**: None
- **Migration Complexity**: HIGH (requires careful consolidation)
- **Action Plan**:
  1. Create new unified middleware design
  2. Implement secure locale extraction
  3. Merge auth error handling
  4. Test thoroughly before deployment

## HIGH PRIORITY - Authentication Components

### 2. Auth Error Page (`/src/app/[locale]/auth/error/page.tsx`)

- **Current Issue**: Uses `window.location.pathname` directly
- **Impact**: Displays auth error messages to users
- **Dependencies**: useSafeLocale hook
- **Migration Complexity**: LOW
- **Action**: Replace with `useSafeLocale()` hook

### 3. Sign-in Page (`/src/app/[locale]/auth/signin/page.tsx`)

- **Current Issue**: Manual pathname parsing
- **Impact**: Authentication entry point
- **Dependencies**: useSafeLocale hook
- **Migration Complexity**: LOW
- **Action**: Replace with `useSafeLocale()` hook

### 4. Sign-in Button (`/src/components/auth/sign-in-button.tsx`)

- **Current Issue**: Manual locale extraction
- **Impact**: Used across the application
- **Dependencies**: useSafeLocale hook
- **Migration Complexity**: LOW
- **Action**: Replace with `useSafeLocale()` hook

### 5. Credentials Form (`/src/components/auth/credentials-form.tsx`)

- **Current Issue**: Manual pathname parsing
- **Impact**: Handles user credentials
- **Dependencies**: useSafeLocale hook
- **Migration Complexity**: LOW
- **Action**: Replace with `useSafeLocale()` hook

## MEDIUM PRIORITY - Dashboard & Utilities

### 6. Dashboard Content (`/src/components/dashboard-content.tsx`)

- **Current Issue**: Manual locale extraction
- **Impact**: Protected route, lower risk
- **Dependencies**: useSafeLocale hook
- **Migration Complexity**: LOW
- **Action**: Replace with `useSafeLocale()` hook

### 7. Language Selector (`/src/components/language-selector.tsx`)

- **Current Issue**: Complex pathname splitting
- **Impact**: Locale switching functionality
- **Dependencies**: Navigation utilities
- **Migration Complexity**: MEDIUM
- **Action**: Use `switchLocale()` utility

### 8. Auth Library (`/src/lib/auth.ts`)

- **Current Issue**: Server-side URL parsing
- **Impact**: URL construction in server functions
- **Dependencies**: getSafeLocale function
- **Migration Complexity**: MEDIUM
- **Action**: Review and update URL construction logic

## Migration Checklist per Component

### Pre-Migration Steps

- [ ] Ensure infrastructure is ready (hooks, utilities, tests)
- [ ] Review component for all locale usage
- [ ] Identify all navigation/routing calls
- [ ] Plan testing approach

### Migration Steps

1. [ ] Import secure locale utilities
2. [ ] Replace unsafe locale extraction
3. [ ] Update navigation calls to use utilities
4. [ ] Remove direct pathname manipulation
5. [ ] Add error boundary if needed
6. [ ] Test component functionality
7. [ ] Test with invalid locales
8. [ ] Verify i18n still works

### Post-Migration Steps

- [ ] Run linting and type checking
- [ ] Test locale switching
- [ ] Test with attack vectors
- [ ] Update component tests
- [ ] Document any issues

## Risk Mitigation Strategy

### For Middleware (CRITICAL)

1. Create parallel implementation first
2. Test extensively in development
3. Deploy to staging with monitoring
4. Have rollback plan ready
5. Deploy during low-traffic period

### For Components (HIGH/MEDIUM)

1. Migrate one component at a time
2. Test each component individually
3. Monitor for console errors
4. Check locale switching works
5. Verify translations load correctly

## Success Criteria

### Component Migration Complete When:

- No unsafe locale extraction remains
- All tests pass
- Locale switching works correctly
- Invalid locales are handled gracefully
- No console errors in development/production
- Translations load properly

### Overall Migration Complete When:

- All components use secure locale handling
- Middleware validates all locale inputs
- Security audit shows no vulnerabilities
- Performance metrics remain stable
- Documentation is updated

## Timeline Estimate

- **Middleware Migration**: 2-3 days (including testing)
- **High Priority Components**: 1 day (4 components)
- **Medium Priority Components**: 1 day (3 components)
- **Testing & Validation**: 1 day
- **Documentation**: 0.5 days

**Total Estimate**: 5-6 days for complete migration

## Next Steps

1. Begin with middleware design and planning
2. Create test suite for middleware
3. Implement middleware changes
4. Deploy and monitor middleware
5. Proceed with component migrations in order
6. Complete testing and documentation
