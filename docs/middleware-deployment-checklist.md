# Middleware Deployment Checklist

## Pre-Deployment Checks

### Code Review

- [ ] All locale extractions use validated functions
- [ ] No hardcoded locale values
- [ ] Security logging in place for invalid attempts
- [ ] All test cases pass
- [ ] TypeScript compilation successful
- [ ] No console.log statements in production code

### Testing Verification

- [ ] Unit tests pass for middleware
- [ ] Manual testing completed for:
  - [ ] Valid locales (en, es, fr, it, de)
  - [ ] Invalid locale attempts
  - [ ] Auth error redirects
  - [ ] API routes exemption
  - [ ] Static asset handling
  - [ ] Cookie-based locale fallback
  - [ ] Accept-Language header fallback

### Performance Checks

- [ ] Middleware overhead < 5ms
- [ ] No blocking operations
- [ ] Efficient regex patterns
- [ ] Early returns for static assets

## Deployment Steps

### 1. Development Environment

- [ ] Copy `middleware.new.ts` to `middleware.ts`
- [ ] Run `pnpm run dev`
- [ ] Test all critical paths:
  - [ ] Visit `/` → redirects to `/en`
  - [ ] Visit `/dashboard` → redirects to `/en/dashboard`
  - [ ] Visit `/es/dashboard` → no redirect
  - [ ] Auth error → redirects to error page
  - [ ] API calls work correctly
- [ ] Monitor console for security logs
- [ ] Check browser DevTools for correct headers

### 2. Staging Environment

- [ ] Deploy to staging branch
- [ ] Run full test suite
- [ ] Test with different browsers:
  - [ ] Chrome
  - [ ] Firefox
  - [ ] Safari
  - [ ] Edge
- [ ] Test with different locales in browser settings
- [ ] Verify error tracking works
- [ ] Load test with multiple concurrent users

### 3. Production Deployment

- [ ] Schedule deployment during low-traffic period
- [ ] Create backup of current middleware
- [ ] Deploy new middleware
- [ ] Monitor error rates for 15 minutes
- [ ] Check security logs for anomalies
- [ ] Verify locale routing works correctly
- [ ] Test auth error scenarios

## Monitoring Checklist

### Immediate (0-15 minutes)

- [ ] Error rate stable or decreasing
- [ ] No 500 errors related to middleware
- [ ] Auth redirects working
- [ ] Locale routing functioning
- [ ] Response times normal

### Short-term (15 minutes - 1 hour)

- [ ] No increase in security warnings
- [ ] Cookie setting working correctly
- [ ] All locales accessible
- [ ] No user complaints

### Long-term (1-24 hours)

- [ ] Performance metrics stable
- [ ] No memory leaks
- [ ] Security logs show expected patterns
- [ ] User sessions maintaining locale

## Rollback Criteria

Rollback immediately if:

- [ ] Error rate increases by > 5%
- [ ] Any 500 errors from middleware
- [ ] Auth redirects broken
- [ ] Locale routing not working
- [ ] Performance degradation > 10%

## Post-Deployment

### Documentation

- [ ] Update deployment notes
- [ ] Document any issues encountered
- [ ] Update runbook with learnings

### Cleanup

- [ ] Remove `middleware.new.ts`
- [ ] Remove old middleware backups after 1 week
- [ ] Update monitoring dashboards

### Communication

- [ ] Notify team of successful deployment
- [ ] Update status page if applicable
- [ ] Document in changelog

## Rollback Procedure

If rollback needed:

1. **Immediate Actions**

   ```bash
   # Copy backup middleware
   cp backups/middleware/[timestamp]/middleware.ts ./middleware.ts

   # Restart application
   pnpm run build
   pnpm run start
   ```

2. **Verify Rollback**
   - [ ] Old middleware active
   - [ ] Error rates returning to normal
   - [ ] Auth redirects working
   - [ ] Notify team of rollback

3. **Post-Rollback**
   - [ ] Investigate root cause
   - [ ] Fix issues in new middleware
   - [ ] Plan re-deployment

## Sign-offs

- [ ] Developer: ******\_\_\_****** Date: ******\_\_\_******
- [ ] Security Review: ******\_\_\_****** Date: ******\_\_\_******
- [ ] QA Testing: ******\_\_\_****** Date: ******\_\_\_******
- [ ] Production Approval: ******\_\_\_****** Date: ******\_\_\_******
