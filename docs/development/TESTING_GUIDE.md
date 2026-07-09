# 📚 Comprehensive Testing Guide

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Test Categories](#test-categories)
3. [Running Tests](#running-tests)
4. [Writing Tests](#writing-tests)
5. [Best Practices](#best-practices)
6. [Troubleshooting](#troubleshooting)

---

## Testing Philosophy

Our testing strategy follows the **Test Pyramid** approach:

```
         /\         E2E Tests (10%)
        /  \        - Critical user journeys
       /    \       - Cross-browser testing
      /      \
     /--------\     Integration Tests (30%)
    /          \    - API endpoints
   /            \   - Database operations
  /              \
 /________________\ Unit Tests (60%)
                    - Business logic
                    - Utilities
                    - Components
```

### Core Principles

1. **Fast Feedback**: Unit tests run in milliseconds
2. **Comprehensive Coverage**: Every feature has tests
3. **Maintainable**: Tests are easy to understand and update
4. **Reliable**: No flaky tests allowed
5. **Isolated**: Tests don't depend on each other

---

## Test Categories

### 1. Unit Tests

**Location**: `src/test/unit/`
**Purpose**: Test individual functions and components in isolation

```typescript
// Example unit test
describe("AuthService", () => {
  it("should hash passwords correctly", async () => {
    const password = "Test123!";
    const hash = await hashPassword(password);
    expect(hash).not.toBe(password);
    expect(await verifyPassword(password, hash)).toBe(true);
  });
});
```

### 2. Integration Tests

**Location**: `src/test/integration/`
**Purpose**: Test component interactions with real dependencies

```typescript
// Example integration test
describe("Auth API", () => {
  it("should create user in database", async () => {
    const user = await createUser({
      email: "test@example.com",
      password: "Test123!",
    });

    const dbUser = await prisma.user.findUnique({
      where: { email: "test@example.com" },
    });

    expect(dbUser).toBeDefined();
    expect(dbUser.email).toBe("test@example.com");
  });
});
```

### 3. E2E Tests

**Location**: `e2e/`
**Purpose**: Test complete user workflows

```typescript
// Example E2E test
test("user can complete registration", async ({ page }) => {
  await page.goto("/register");
  await page.fill('[name="email"]', "new@example.com");
  await page.fill('[name="password"]', "Test123!");
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL(/dashboard/);
});
```

### 4. Performance Tests

**Location**: `performance-tests/`
**Purpose**: Ensure application meets performance requirements

```yaml
# Example performance test config
config:
  target: "http://localhost:3000"
  phases:
    - duration: 60
      arrivalRate: 10
  ensure:
    - http.response_time.p95: 500
```

---

## Running Tests

### Quick Start

```bash
# Run all tests
pnpm test

# Run specific test suites
pnpm test:unit           # Unit tests only
pnpm test:integration    # Integration tests
pnpm test:e2e           # E2E tests
pnpm perf:load          # Performance tests

# Run with coverage
pnpm test:coverage

# Run in watch mode
pnpm test:watch

# Run specific test file
pnpm test auth.test.ts
```

### Test Environments

#### Development

```bash
# Use mock database
TEST_MODE=mock pnpm test

# Use real database
TEST_MODE=real pnpm test:integration
```

#### CI/CD

```bash
# Full test suite with coverage
CI=true pnpm test:ci

# E2E tests headless
pnpm test:e2e:headless
```

### Performance Testing

```bash
# Quick performance check
pnpm perf:quick

# Full load test
pnpm perf:load

# Stress test
pnpm perf:stress

# Generate report
pnpm perf:report
```

---

## Writing Tests

### Test Structure

```typescript
describe("Feature Name", () => {
  // Setup
  beforeAll(async () => {
    // Global setup
  });

  beforeEach(async () => {
    // Test-specific setup
  });

  // Tests
  it("should do something specific", async () => {
    // Arrange
    const input = prepareTestData();

    // Act
    const result = await performAction(input);

    // Assert
    expect(result).toMatchExpectedOutput();
  });

  // Cleanup
  afterEach(async () => {
    // Test-specific cleanup
  });

  afterAll(async () => {
    // Global cleanup
  });
});
```

### Using Test Builders

```typescript
import { UserBuilder } from "@/test/builders";

const user = new UserBuilder()
  .withEmail("test@example.com")
  .withRole("admin")
  .withVerified(true)
  .build();
```

### Page Objects (E2E)

```typescript
import { LoginPage } from "../pages/login.page";

test("login flow", async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.login("user@example.com", "password");
  await loginPage.assertLoginSuccess();
});
```

### Mocking

```typescript
// Mock external services
jest.mock("@/lib/email", () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock Prisma
jest.mock("@/lib/prisma", () => ({
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
}));
```

---

## Best Practices

### 1. Test Naming

```typescript
// ✅ Good - Descriptive and specific
it("should return 401 when user provides invalid credentials");

// ❌ Bad - Vague
it("test login");
```

### 2. Assertions

```typescript
// ✅ Good - Specific assertions
expect(user.email).toBe("test@example.com");
expect(user.roles).toContain("admin");

// ❌ Bad - Generic assertions
expect(user).toBeDefined();
```

### 3. Test Data

```typescript
// ✅ Good - Use builders/factories
const user = UserFactory.create({ email: "test@example.com" });

// ❌ Bad - Hardcoded data
const user = {
  id: "123",
  email: "test@example.com",
  password: "hashed",
  // ... many more fields
};
```

### 4. Async Operations

```typescript
// ✅ Good - Proper async handling
it("should fetch user", async () => {
  const user = await fetchUser("123");
  expect(user).toBeDefined();
});

// ❌ Bad - Missing await
it("should fetch user", () => {
  const user = fetchUser("123"); // Missing await!
  expect(user).toBeDefined();
});
```

### 5. Test Isolation

```typescript
// ✅ Good - Independent tests
beforeEach(async () => {
  await resetDatabase();
});

// ❌ Bad - Tests depend on order
it("test 1", () => {
  // Creates global state
});

it("test 2", () => {
  // Depends on test 1's state
});
```

---

## Troubleshooting

### Common Issues

#### 1. Flaky Tests

**Problem**: Tests pass/fail randomly
**Solution**:

- Add explicit waits
- Use retry mechanisms
- Fix race conditions
- Isolate test data

```typescript
// Add retries for flaky operations
await retry(
  async () => {
    const result = await unstableOperation();
    expect(result).toBe("success");
  },
  { retries: 3, delay: 100 },
);
```

#### 2. Slow Tests

**Problem**: Tests take too long
**Solution**:

- Use test parallelization
- Mock expensive operations
- Optimize database queries
- Use test data builders

```typescript
// Run tests in parallel
describe.concurrent("Fast tests", () => {
  it.concurrent("test 1", async () => {});
  it.concurrent("test 2", async () => {});
});
```

#### 3. Database Issues

**Problem**: Database connection errors
**Solution**:

- Check Docker is running
- Verify connection string
- Reset database state

```bash
# Reset test database
docker-compose down
docker-compose up -d
pnpm prisma:push
```

#### 4. E2E Test Failures

**Problem**: E2E tests fail but app works
**Solution**:

- Update selectors
- Add wait conditions
- Check for timing issues

```typescript
// Wait for elements
await page.waitForSelector("#submit-button", {
  state: "visible",
  timeout: 10000,
});
```

### Debug Commands

```bash
# Run tests with debug output
DEBUG=* pnpm test

# Run E2E tests with UI
pnpm test:e2e:ui

# Run specific test with verbose output
pnpm test --verbose auth.test.ts

# Generate coverage report
pnpm test:coverage
open coverage/index.html
```

---

## Test Coverage Goals

### Current Coverage

- Unit Tests: 100% ✅
- Integration Tests: 100% ✅
- E2E Tests: 49% 🟡
- Overall: 85% 🟢

### Target Coverage

- Statements: > 80%
- Branches: > 75%
- Functions: > 80%
- Lines: > 80%

### Coverage Reports

```bash
# Generate HTML report
pnpm test:coverage

# View report
open coverage/lcov-report/index.html

# CI coverage check
pnpm test:coverage -- --coverageThreshold='{
  "global": {
    "branches": 75,
    "functions": 80,
    "lines": 80,
    "statements": 80
  }
}'
```

---

## CI/CD Integration

### GitHub Actions

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: pnpm install
      - run: pnpm test:ci
      - run: pnpm test:e2e
```

### Pre-commit Hooks

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "pnpm test:unit"
    }
  }
}
```

---

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Artillery Documentation](https://www.artillery.io/docs)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

---

_Last Updated: ${new Date().toISOString()}_
