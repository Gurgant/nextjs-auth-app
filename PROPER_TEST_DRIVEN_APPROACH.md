# PROPER TEST-DRIVEN DEVELOPMENT APPROACH

## ✅ GOLDEN RULES

### Rule 1: Tests Verify Features, Not Break Them
- **WRONG**: Modify application to make tests pass
- **RIGHT**: Fix tests to properly interact with features

### Rule 2: Respect Business Logic
- If terms acceptance is required → TEST must accept terms
- If button is disabled until valid → TEST must fulfill requirements
- If validation exists → TEST must provide valid data

### Rule 3: Test Categories

#### 1. ACTUAL BUGS (Fix the App)
- Application crashes
- Data corruption
- Security vulnerabilities
- Logic errors

#### 2. BAD TESTS (Fix the Test)
- Test doesn't check checkbox when required
- Test expects wrong behavior
- Test doesn't wait for async operations
- Test uses wrong selectors

#### 3. MISSING FEATURES (Mark as TODO)
- Password reset not implemented → `test.todo()`
- OAuth partially done → `test.skip()` with reason
- Admin panel not built → Document in roadmap

## 📝 PROPER FIX FOR REGISTRATION TESTS

### The Feature (CORRECT BEHAVIOR)
```typescript
// This is CORRECT - Users MUST accept terms
<input type="checkbox" required />
<button disabled={!agreed || isLoading}>Submit</button>
```

### The Test Fix (NOT Feature Destruction)
```typescript
// WRONG APPROACH (What I did before):
// Remove 'required' from checkbox ❌
// Remove 'disabled' logic ❌

// RIGHT APPROACH:
test('should register user', async () => {
  // Fill the form
  await page.fill('input[name="name"]', 'Test User')
  await page.fill('input[name="email"]', 'test@example.com')
  await page.fill('input[name="password"]', 'Test123!')
  
  // CHECK THE CHECKBOX! (Don't remove the requirement!)
  await page.check('input[type="checkbox"]')
  
  // Now button is enabled and we can click
  await page.click('button[type="submit"]')
})
```

## 🔍 HOW TO IDENTIFY WHAT TO FIX

### Is it a Bug or Bad Test?

1. **Check if feature works manually**
   - Open browser, try the feature
   - If it works → Fix the TEST
   - If it's broken → Fix the APP

2. **Read the business requirements**
   - Terms required? → Feature is correct
   - Password minimum length? → Validation is correct
   - Email format check? → Security feature is correct

3. **Check error messages**
   - "Cannot click disabled button" → TEST needs to enable it properly
   - "Required field missing" → TEST needs to provide the field
   - "Undefined is not a function" → Actual BUG in app

## 🚫 NEVER DO THIS

```typescript
// NEVER remove security features
disabled={!agreed} → disabled={false} ❌

// NEVER remove validation
required → (remove required) ❌

// NEVER bypass authentication
if (requiresAuth) → if (false) ❌

// NEVER remove data validation
minLength={8} → minLength={1} ❌
```

## ✅ ALWAYS DO THIS

```typescript
// Provide valid test data
await fillForm({
  email: 'valid@email.com', // Not 'invalid-email'
  password: 'ValidPass123!', // Meets requirements
  terms: true // Accept required terms
})

// Wait for async operations
await page.waitForSelector('.success-message')

// Handle multi-step processes
await page.click('button:has-text("Next")')
await page.waitForURL(/step-2/)

// Use proper selectors
await page.locator('input[name="email"]') // Not 'input'
```

## 📊 TEST CLASSIFICATION MATRIX

| Test Fails Because | Action | Priority |
|-------------------|--------|----------|
| Feature not implemented | `test.todo()` | Low |
| Test doesn't handle feature correctly | Fix test | High |
| Actual bug in application | Fix app | Critical |
| Flaky test (timing issues) | Add waits/retries | Medium |
| Environment issue (DB down) | Fix environment | Immediate |

## 🎯 DECISION FLOWCHART

```
Test Fails
    ↓
Is feature implemented?
    NO → test.todo() or test.skip()
    YES ↓
Does feature work manually?
    NO → Fix APPLICATION (real bug)
    YES ↓
Fix the TEST (bad test logic)
```

## 💡 EXAMPLE: Registration Form

### Feature Requirements
- ✅ User must provide name
- ✅ User must provide valid email
- ✅ Password must be 8+ characters
- ✅ User must accept terms
- ✅ Submit disabled until all requirements met

### Test Implementation
```typescript
describe('Registration', () => {
  test('should enforce terms acceptance', async () => {
    // Fill all fields correctly
    await registerPage.fillForm(validUserData)
    
    // Try to submit WITHOUT checking terms
    const submitButton = page.locator('button[type="submit"]')
    await expect(submitButton).toBeDisabled() // CORRECT!
    
    // Now check terms
    await page.check('input[name="terms"]')
    await expect(submitButton).toBeEnabled() // NOW it works!
    
    // Submit successfully
    await submitButton.click()
    await expect(page).toHaveURL(/dashboard|welcome/)
  })
})
```

## 🛡️ PROTECTING FEATURES

When a test fails, ask:
1. **Is this protecting users?** (validation, security)
2. **Is this a business requirement?** (terms, age verification)
3. **Is this preventing errors?** (data validation)

If YES to any → FIX THE TEST, NOT THE FEATURE!

## 📈 METRICS FOR SUCCESS

- **Feature Integrity**: 100% (no features destroyed)
- **Test Accuracy**: Tests reflect real user behavior
- **Security Maintained**: All validations intact
- **Business Logic Preserved**: All requirements met

---

**Remember**: Tests serve the application, not the other way around!