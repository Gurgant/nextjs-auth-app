/**
 * Test Grouping Strategy for Performance Optimization
 * Groups tests by authentication requirements to minimize state transitions
 */

import { test as baseTest, Page } from "@playwright/test";
import { AuthStateManager, AuthState } from "./auth-state-manager";

// Define custom fixture types
type AuthTestFixtures = {
  authenticatedPage: Page;
};

/**
 * Create grouped tests that share authentication state
 */
export function createAuthGroup(authState: AuthState, groupName: string) {
  const test = baseTest.extend<AuthTestFixtures>({
    // Shared setup for all tests in this group
    authenticatedPage: async ({ page }, use) => {
      await AuthStateManager.ensureAuthState(page, authState);
      await use(page);
    },
  });

  // Override describe to add group identification
  const describe = (title: string, fn: () => void) => {
    return test.describe(`${groupName} › ${title}`, fn);
  };

  return { test, describe };
}

/**
 * Performance-optimized test groupings
 */

// Group 1: Tests that require logged-out state
export const LoggedOutTests = createAuthGroup("logged-out", "🚫 Logged Out");

// Group 2: Tests that require basic user authentication
export const UserTests = createAuthGroup("user", "👤 User Auth");

// Group 3: Tests that require admin authentication
export const AdminTests = createAuthGroup("admin", "🔐 Admin Auth");

// Group 4: Tests that require pro user authentication
export const ProUserTests = createAuthGroup("pro-user", "⭐ Pro User Auth");

// Group 5: Tests that require unverified user
export const UnverifiedTests = createAuthGroup(
  "unverified",
  "❓ Unverified Auth",
);

/**
 * Smart test wrapper that infers authentication needs
 */
export function smartTest(
  testName: string,
  authRequirement: AuthState,
  testFn: ({
    page,
    authenticatedPage,
  }: {
    page: Page;
    authenticatedPage: Page;
  }) => Promise<void>,
) {
  const groupMap = {
    "logged-out": LoggedOutTests,
    user: UserTests,
    admin: AdminTests,
    "pro-user": ProUserTests,
    unverified: UnverifiedTests,
  };

  const { test } = groupMap[authRequirement];

  return test(testName, async ({ page }) => {
    await AuthStateManager.ensureAuthState(page, authRequirement);
    await testFn({ page, authenticatedPage: page });
  });
}

/**
 * Batch test configuration for parallel execution
 */
export const TestBatches = {
  // Fast batch: Tests that don't require authentication changes
  fast: {
    pattern: "**/*translation*.e2e.ts",
    workers: 4,
    timeout: 30000,
  },

  // Medium batch: Tests with simple auth requirements
  medium: {
    pattern: "**/*{terms,dashboard}*.e2e.ts",
    workers: 2,
    timeout: 45000,
  },

  // Slow batch: Complex authentication flows
  slow: {
    pattern: "**/*{auth-login,auth-registration,role-access}*.e2e.ts",
    workers: 1, // Serialize for stability
    timeout: 60000,
  },
} as const;
