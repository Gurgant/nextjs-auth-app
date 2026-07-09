# 🏆 ENTERPRISE BEST PRACTICES GUIDE

## 📚 TABLE OF CONTENTS

1. [Test-Driven Development](#test-driven-development)
2. [Type Safety](#type-safety)
3. [Error Handling](#error-handling)
4. [Performance Optimization](#performance-optimization)
5. [Code Organization](#code-organization)
6. [Continuous Integration](#continuous-integration)
7. [Security Practices](#security-practices)
8. [Documentation Standards](#documentation-standards)

---

## 1. TEST-DRIVEN DEVELOPMENT

### ✅ DO's

```typescript
// Test the feature as users would use it
test("should require terms acceptance for registration", async () => {
  await fillForm(validData);
  const submitButton = page.locator('button[type="submit"]');

  // Button disabled without terms
  await expect(submitButton).toBeDisabled();

  // Check terms and verify enabled
  await page.check('input[name="terms"]');
  await expect(submitButton).toBeEnabled();
});
```

### ❌ DON'Ts

```typescript
// NEVER destroy features for tests
// BAD: Removing required attribute
<input type="checkbox" required /> → <input type="checkbox" />

// BAD: Disabling validation
disabled={!agreed} → disabled={false}
```

### 🎯 PRINCIPLES

1. **Tests serve features, not vice versa**
2. **Preserve business logic integrity**
3. **Test user journeys, not implementation**
4. **Mark unimplemented features appropriately**

---

## 2. TYPE SAFETY

### ✅ PROPER TYPE ALIGNMENT

```typescript
// Align test builders with schema
export class UserBuilder {
  protected getDefaults(): User {
    return {
      // Only include fields that exist in Prisma schema
      id: generate.uuid(),
      email: generate.email(),
      backupCodes: [], // Not null, use empty array
      loginAttempts: 0, // Not failedLoginAttempts
      lockedUntil: null, // Not accountLockedUntil
    };
  }
}
```

### ✅ TYPE GUARDS

```typescript
// Use type guards for union types
function isErrorResponse(response: ActionResponse): response is ErrorResponse {
  return response.success === false;
}

// Use in tests
if (isErrorResponse(result)) {
  expect(result.message).toContain("error");
}
```

### ✅ CONSISTENT RESPONSE TYPES

```typescript
// Always return ActionResponse format
export interface ActionResponse {
  success: boolean;
  message: string;
  data?: any;
  errors?: Record<string, string>;
}

// Consistent error creation
return createErrorResponse(error.getUserMessage());
```

---

## 3. ERROR HANDLING

### ✅ STANDARDIZED ERROR RESPONSES

```typescript
// Command error handling pattern
export class RegisterUserCommand {
  async execute(input: Input): Promise<ActionResponse> {
    try {
      // Business logic
      return createSuccessResponse("Success!", data);
    } catch (error) {
      const baseError = ErrorFactory.wrap(error);
      baseError.log();
      return createErrorResponse(baseError.getUserMessage());
    }
  }
}
```

### ✅ ERROR FACTORY PATTERN

```typescript
// Centralized error creation
const error = ErrorFactory.validation.fromZod(zodError);
const error = ErrorFactory.auth.invalidCredentials();
const error = ErrorFactory.business.alreadyExists("User", { email });
```

### ✅ PROPER ERROR LOGGING

```typescript
// Log with context
error.log();
this.logError(error, {
  commandId: metadata?.commandId,
  userId: metadata?.userId,
  action: "user_registration",
});
```

---

## 4. PERFORMANCE OPTIMIZATION

### ✅ REALISTIC THRESHOLDS

```typescript
// Account for all operations
describe("Performance Tests", () => {
  it("should complete within threshold", async () => {
    // Consider bcrypt, I/O, etc.
    if (IS_REAL_DB) {
      expect(avgTime).toBeLessThan(500); // Real DB
    } else {
      expect(avgTime).toBeLessThan(200); // Mock + bcrypt
    }
  });
});
```

### ✅ PROPER MEASUREMENT

```typescript
// Warm up before measuring
await operation(); // warm-up run
const start = Date.now();
await operation(); // measured run
const duration = Date.now() - start;
```

### ✅ CACHING STRATEGIES

```typescript
// Use LRU cache for rate limiting
const loginRateLimiter = new LRUCache<string, number>({
  max: 1000,
  ttl: 60000, // 1 minute
});
```

---

## 5. CODE ORGANIZATION

### ✅ PROJECT STRUCTURE

```
src/
├── lib/
│   ├── commands/        # Command pattern
│   ├── errors/          # Error handling
│   ├── events/          # Event system
│   └── repositories/    # Data access
├── test/
│   ├── builders/        # Test data builders
│   ├── mocks/          # Mock implementations
│   ├── unit/           # Unit tests
│   ├── integration/    # Integration tests
│   └── hybrid/         # Hybrid tests
└── e2e/
    ├── pages/          # Page objects
    └── tests/          # E2E test scenarios
```

### ✅ PAGE OBJECT MODEL

```typescript
export class RegisterPage extends BasePage {
  async register(data: UserData) {
    await this.fillForm(data);
    if (data.acceptTerms !== false) {
      await this.page.check('input[name="terms"]');
    }
    await this.submitForm();
  }
}
```

### ✅ TEST BUILDERS

```typescript
// Chainable builder pattern
const user = new UserBuilder()
  .withEmail("test@example.com")
  .withPassword("Test123!")
  .verified()
  .build();
```

---

## 6. CONTINUOUS INTEGRATION

### ✅ PRE-COMMIT HOOKS

```json
{
  "scripts": {
    "pre-commit": "pnpm lint && pnpm typecheck && pnpm test",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "jest"
  }
}
```

### ✅ CI PIPELINE

```yaml
steps:
  - name: Install
    run: pnpm install

  - name: Lint
    run: pnpm run lint

  - name: Type Check
    run: pnpm run typecheck

  - name: Test
    run: pnpm test --coverage

  - name: E2E Tests
    run: pnpm exec playwright test
```

### ✅ QUALITY GATES

- Minimum test coverage: 80%
- Zero TypeScript errors
- Zero ESLint errors
- All tests passing

---

## 7. SECURITY PRACTICES

### ✅ AUTHENTICATION

```typescript
// Rate limiting
const attempts = loginRateLimiter.get(email) || 0;
if (attempts >= MAX_ATTEMPTS) {
  return createErrorResponse("Too many attempts");
}

// Password hashing
const hashedPassword = await bcrypt.hash(password, 12);

// Session management
await userRepo.updateLastLogin(user.id);
```

### ✅ INPUT VALIDATION

```typescript
// Zod schemas
const schema = z
  .object({
    email: emailSchema,
    password: passwordSchema.min(8),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword);

// Validate before processing
const result = schema.safeParse(input);
if (!result.success) {
  return createValidationError(result.error);
}
```

### ✅ ERROR MESSAGES

```typescript
// Don't leak sensitive info
// BAD: "User with email john@example.com not found"
// GOOD: "Invalid email or password"
return createErrorResponse("Invalid credentials");
```

---

## 8. DOCUMENTATION STANDARDS

### ✅ CLAUDE.md

```markdown
# Project Context

- Package manager: pnpm (NEVER npm)
- Working directory: /path/to/project
- Test philosophy: Fix tests, not features
- Current phase: Implementation complete
```

### ✅ CODE COMMENTS

```typescript
// Only add meaningful comments
// GOOD: Explains why, not what
// Terms checkbox is REQUIRED by business logic
if (data.acceptTerms !== false) {
  await page.check('input[name="terms"]');
}

// BAD: Redundant comment
// Check the checkbox
await page.check('input[name="terms"]');
```

### ✅ TEST DESCRIPTIONS

```typescript
describe("User Registration", () => {
  it("should enforce terms acceptance requirement", async () => {
    // Clear test intent
  });

  test.todo("should implement password reset flow");

  test.skip("OAuth integration - pending provider setup", async () => {
    // Document why skipped
  });
});
```

---

## 🎯 GOLDEN RULES

1. **Features > Tests**: Never break features to pass tests
2. **Type Safety**: If TypeScript complains, fix it properly
3. **Error Handling**: Always return consistent response format
4. **Performance**: Set realistic expectations
5. **Documentation**: Keep it current and meaningful
6. **Security**: Never compromise for convenience
7. **Quality**: Enterprise grade or nothing

---

## 📋 CHECKLIST FOR SUCCESS

Before marking any task complete:

- [ ] All tests passing (100%)
- [ ] TypeScript: 0 errors
- [ ] ESLint: 0 warnings/errors
- [ ] Features working as designed
- [ ] Error handling consistent
- [ ] Performance acceptable
- [ ] Security maintained
- [ ] Documentation updated

---

## 🚀 CONTINUOUS IMPROVEMENT

1. **Regular Reviews**
   - Weekly test suite health check
   - Monthly dependency updates
   - Quarterly architecture review

2. **Metrics Tracking**
   - Test execution time
   - Coverage percentage
   - Build success rate
   - Error frequency

3. **Knowledge Sharing**
   - Document patterns that work
   - Share lessons learned
   - Maintain best practices

---

**Remember**: Quality is not negotiable. Every line of code represents your commitment to excellence.

Generated with comprehensive analysis of successful patterns and practices.
