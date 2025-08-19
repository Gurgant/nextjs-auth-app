# NEXT STEPS ACTION PLAN

## Immediate Actions Required (Next 2 Hours)

### 1. Fix Critical Registration Flow (30 mins)
```typescript
// Fix 1: Update registration form selectors
// File: e2e/pages/register.page.ts
- termsCheckbox: 'input[name="acceptTerms"]'
+ termsCheckbox: 'input[type="checkbox"]'

// Fix 2: Enable submit button
// File: src/app/[locale]/register/page.tsx
// Ensure checkbox state enables submit button
```

### 2. Resolve Type Errors (45 mins)
```bash
# Step 1: Generate Prisma types
pnpx prisma generate

# Step 2: Export types properly
# File: src/lib/types/prisma.ts
export type { User, Account, Session } from '@prisma/client'

# Step 3: Fix action response types
# File: src/lib/types/actions.ts
export type ActionResponse = 
  | { success: true; data: any }
  | { success: false; error: string }
```

### 3. Fix Login Test Failures (45 mins)
```typescript
// Fix error display
// File: src/app/[locale]/login/page.tsx
// Ensure error messages render in [role="alert"]

// Fix session validation
// File: e2e/tests/auth-login.e2e.ts
// Add proper wait conditions for login completion
```

## Day 1 Tasks

### Morning (3 hours)
1. **Fix All Registration Tests**
   - Update form validation logic
   - Fix checkbox handling
   - Enable submit button correctly
   - Test with: `pnpm exec playwright test auth-registration`

2. **Complete TypeScript Fixes**
   - Run `pnpm run typecheck` after each fix
   - Target: 0 type errors

### Afternoon (3 hours)
1. **Fix Remaining Login Tests**
   - Error message display
   - Session handling
   - Redirect logic
   - Test with: `pnpm exec playwright test auth-login`

2. **Update Documentation**
   - Create README with setup instructions
   - Document test commands
   - Add troubleshooting guide

## Week 1 Roadmap

### Day 2-3: Complete E2E Coverage
- [ ] Password reset flow
- [ ] Email verification
- [ ] OAuth integration
- [ ] Multi-language testing

### Day 4: Performance Testing
- [ ] Set up Artillery
- [ ] Create load test scenarios
- [ ] Benchmark response times
- [ ] Generate performance report

### Day 5: Production Prep
- [ ] Security audit
- [ ] Environment configuration
- [ ] CI/CD pipeline setup
- [ ] Deployment documentation

## Quick Fix Commands

```bash
# Fix TypeScript errors
pnpx prisma generate
pnpm run typecheck

# Run failing tests individually
pnpm exec playwright test auth-registration --debug
pnpm exec playwright test auth-login --debug

# Check specific test
pnpm exec playwright test -g "should register new user"

# Update snapshots if needed
pnpm exec playwright test --update-snapshots
```

## Debugging Helpers

### Registration Form Debug
```javascript
// Add to registration test for debugging
await page.screenshot({ path: 'debug-registration.png' })
console.log(await page.content())
```

### Login Flow Debug
```javascript
// Check if login actually completed
const isLoggedIn = await page.evaluate(() => {
  return document.cookie.includes('session')
})
```

## Success Criteria

### Phase 7.1 Complete When:
- [ ] All E2E tests passing (45/45)
- [ ] Zero TypeScript errors
- [ ] Zero ESLint warnings
- [ ] All features documented

### Production Ready When:
- [ ] 100% critical path test coverage
- [ ] Performance benchmarks met
- [ ] Security audit passed
- [ ] Deployment automated

## Emergency Fixes

If tests are blocking development:

### Option 1: Skip Failing Tests Temporarily
```typescript
test.skip('problematic test', async () => {
  // Will fix in next sprint
})
```

### Option 2: Increase Timeouts
```typescript
test.setTimeout(60000) // 60 seconds
```

### Option 3: Add Retry Logic
```typescript
test.describe.configure({ retries: 2 })
```

## Contact for Help

- **Playwright Issues**: Check debug videos in `test-results/`
- **Type Errors**: Run `pnpm run typecheck --listFiles`
- **Database Issues**: Check `psql` connection
- **Build Issues**: Clear cache with `rm -rf .next`

---
*Action Plan Created: Post-Phase 7*
*Target: 100% Test Coverage in 5 Days*