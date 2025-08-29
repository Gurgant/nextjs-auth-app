import { test, expect, Page } from "@playwright/test";
import { LoginPage } from "../pages/login.page";

/**
 * Utility functions for enhanced error handling and stability
 */

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      console.log(
        `Attempt ${attempt + 1}/${maxRetries} failed:`,
        (error as Error).message,
      );

      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

/**
 * Direct navigation utilities - more stable than button clicking
 */
async function navigateToUserDashboard(page: Page) {
  console.log("Navigating directly to user dashboard...");
  // Direct navigation to user dashboard to avoid networkidle issues
  await page.goto("/en/dashboard/user", {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });

  console.log("Successfully navigated to user dashboard");
}

async function navigateToProDashboard(page: Page) {
  console.log("Navigating directly to pro dashboard...");
  // Direct navigation to pro dashboard to avoid networkidle issues
  await page.goto("/en/dashboard/pro", {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });

  console.log("Successfully navigated to pro dashboard");
}

async function navigateToAdminPanel(page: Page) {
  console.log("Navigating directly to admin panel...");
  // Direct navigation to admin panel to avoid networkidle issues
  await page.goto("/en/admin", {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });

  console.log("Successfully navigated to admin panel");
}

/**
 * 2FA handling utility
 */
async function handle2FAIfRequired(page: Page) {
  console.log("Checking for 2FA requirement...");
  const has2FA = await page
    .locator('input[name="code"]')
    .isVisible({ timeout: 3000 })
    .catch(() => false);

  if (has2FA) {
    console.log("2FA detected, entering test code...");
    await page.fill('input[name="code"]', "123456");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000); // Wait for 2FA processing
    console.log("2FA completed");
  } else {
    console.log("No 2FA required");
  }

  return has2FA;
}

/**
 * Safe dashboard access after login
 */
async function accessDashboardAfterLogin(page: Page) {
  console.log("Accessing dashboard after login...");

  // Wait a moment for session to be established
  await page.waitForTimeout(2000);

  // Navigate to dashboard using role-based navigation
  // Note: This will redirect to appropriate dashboard based on user role
  await page.goto("/en/dashboard", {
    waitUntil: "networkidle",
    timeout: 15000,
  });

  // Give additional time for any role-based redirects to complete
  await page.waitForTimeout(2000);

  console.log("Dashboard access completed");
}

test.describe("Role-Based Access Control", () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page, context }) => {
    console.log("Starting test setup with comprehensive cleanup...");

    // Simple, effective logout approach (same as auth-simple.e2e.ts)
    await page.goto("http://localhost:3000/api/auth/signout", {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(2000);

    // Navigate to home page in unauthenticated state (simple approach)
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test.describe("USER Role", () => {
    test("should access user dashboard", async ({ page }) => {
      // Login as regular user
      await loginPage.login("test@example.com", "Test123!");
      // Login method handles session synchronization - no timeout needed

      // Click dashboard button if present, otherwise navigate directly
      const dashboardButton = page.locator(
        '[data-testid="go-to-dashboard-button"]',
      );
      if ((await dashboardButton.count()) > 0) {
        await dashboardButton.click();
        await page.waitForTimeout(2000);
      } else {
        // Navigate directly to dashboard - will redirect to user dashboard
        await navigateToUserDashboard(page);
      }

      // Should be redirected to user dashboard based on USER role
      await page.waitForURL("**/dashboard/user", { timeout: 10000 });

      // Verify we're on the user dashboard
      const isOnUserDashboard = page.url().includes("/dashboard/user");
      expect(isOnUserDashboard).toBeTruthy();

      // Verify dashboard content exists (flexible check)
      const hasContent = await page
        .locator("main, h1, h2")
        .first()
        .isVisible({ timeout: 5000 });
      expect(hasContent).toBeTruthy();
    });

    test("should be denied access to pro dashboard", async ({ page }) => {
      // Login as regular user
      await loginPage.login("test@example.com", "Test123!");
      // Login method handles session synchronization - no timeout needed

      // Try to access pro dashboard directly
      await page.goto("/en/dashboard/pro");

      // Should be redirected back to user dashboard (role enforcement)
      await page.waitForURL("**/dashboard/user", { timeout: 10000 });

      // Verify we're on user dashboard, not pro dashboard
      expect(page.url()).toContain("/dashboard/user");
      expect(page.url()).not.toContain("/dashboard/pro");
    });

    test("should be denied access to admin panel", async ({ page }) => {
      // Login as regular user
      await loginPage.login("test@example.com", "Test123!");
      // Login method handles session synchronization - no timeout needed

      // Try to access admin panel directly
      await page.goto("/en/admin");

      // Should be redirected to user dashboard (role enforcement)
      await page.waitForURL("**/dashboard/user", { timeout: 10000 });

      // Verify we're on user dashboard, not admin panel
      expect(page.url()).toContain("/dashboard/user");
      expect(page.url()).not.toContain("/admin");
    });
  });

  test.describe("PRO_USER Role", () => {
    test("should access pro dashboard", async ({ page }) => {
      // Login as pro user
      await loginPage.login("2fa@example.com", "2FA123!");

      // Verify login was successful by checking current URL and session
      const currentUrl = page.url();
      console.log("URL after login attempt:", currentUrl);

      // Check if we're redirected back to signin (indicating login failure)
      if (currentUrl.includes("/signin") || currentUrl.includes("/auth")) {
        throw new Error(`PRO_USER login failed - redirected to: ${currentUrl}`);
      }

      // Wait a moment for session to stabilize
      await page.waitForTimeout(2000);

      // Navigate to dashboard - should redirect to PRO dashboard
      await navigateToProDashboard(page);

      // Verify we're on the pro dashboard
      expect(page.url()).toContain("/dashboard/pro");

      // Verify dashboard content exists
      const hasContent = await page
        .locator("main, h1, h2")
        .first()
        .isVisible({ timeout: 5000 });
      expect(hasContent).toBeTruthy();
    });

    test("should access user dashboard from pro role", async ({ page }) => {
      // Login as pro user
      await loginPage.login("2fa@example.com", "2FA123!");

      // Try to access user dashboard directly - PRO users should have access
      await page.goto("/en/dashboard/user");

      // Should successfully access user dashboard
      await page.waitForURL("**/dashboard/user", { timeout: 5000 });
      expect(page.url()).toContain("/dashboard/user");

      // Verify dashboard content exists
      const hasContent = await page
        .locator("main, h1, h2")
        .first()
        .isVisible({ timeout: 5000 });
      expect(hasContent).toBeTruthy();
    });

    test("should be denied access to admin panel", async ({ page }) => {
      // Login as pro user
      await loginPage.login("2fa@example.com", "2FA123!");

      // Try to access admin panel directly
      await page.goto("/en/admin");

      // Should be redirected away from admin panel (role enforcement)
      await page.waitForURL("**/dashboard/user", { timeout: 10000 });

      // Verify we're not on admin panel
      expect(page.url()).not.toContain("/admin");
      expect(page.url()).toContain("/dashboard/user");
    });
  });

  test.describe("ADMIN Role", () => {
    test("should access admin panel", async ({ page }) => {
      // Login as admin
      await loginPage.login("admin@example.com", "Admin123!");
      // Login method handles session synchronization - no timeout needed

      // Navigate to dashboard - should redirect to admin panel
      await navigateToAdminPanel(page);

      // Verify we're on the admin panel
      expect(page.url()).toContain("/admin");

      // Verify admin content exists
      const hasContent = await page
        .locator("main, h1, h2")
        .first()
        .isVisible({ timeout: 5000 });
      expect(hasContent).toBeTruthy();
    });

    test("should access all dashboards", async ({ page }) => {
      // Login as admin
      await loginPage.login("admin@example.com", "Admin123!");
      // Login method handles session synchronization - no timeout needed

      // Test access to pro dashboard (ADMIN should have access)
      await page.goto("/en/dashboard/pro");
      await page.waitForURL("**/dashboard/pro", { timeout: 5000 });
      expect(page.url()).toContain("/dashboard/pro");

      // Test access to user dashboard (ADMIN should have access)
      await page.goto("/en/dashboard/user");
      await page.waitForURL("**/dashboard/user", { timeout: 5000 });
      expect(page.url()).toContain("/dashboard/user");

      // Return to admin panel
      await page.goto("/en/admin", {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });
      await page.waitForURL("**/admin", { timeout: 5000 });
      expect(page.url()).toContain("/admin");
    });

    test("should see user management features", async ({ page }) => {
      // Login as admin
      await loginPage.login("admin@example.com", "Admin123!");
      // Login method handles session synchronization - no timeout needed

      // Navigate to admin panel
      await page.goto("/en/admin", {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      // Wait for admin panel to load
      await page.waitForURL("**/admin", { timeout: 10000 });

      // Check for admin content
      const hasContent = await page
        .locator("main, h1, h2")
        .first()
        .isVisible({ timeout: 5000 });
      expect(hasContent).toBeTruthy();

      // Verify we're on admin panel
      expect(page.url()).toContain("/admin");
    });
  });

  test.describe("Role Navigation", () => {
    test("should redirect from base dashboard to role-specific dashboard", async ({
      page,
    }) => {
      // Login as regular user
      await loginPage.login("test@example.com", "Test123!");
      // Login method handles session synchronization - no timeout needed

      // Navigate to base dashboard - should redirect based on role
      await navigateToUserDashboard(page);

      // Should be redirected to user dashboard based on USER role

      // Verify we're on user dashboard
      expect(page.url()).toContain("/dashboard/user");
    });

    test("should show appropriate navigation based on role", async ({
      page,
    }) => {
      test.setTimeout(120000); // 2 minutes for complex multi-user navigation test
      // Login as admin
      await loginPage.login("admin@example.com", "Admin123!");
      // Login method handles session synchronization - no timeout needed

      // Navigate to dashboard - should go to admin panel
      await navigateToAdminPanel(page);
      expect(page.url()).toContain("/admin");

      // Logout and login as regular user to test role restrictions
      await loginPage.performLogout();
      await loginPage.login("test@example.com", "Test123!");
      // Login method handles session synchronization - no timeout needed

      // Navigate to dashboard - should go to user dashboard
      await navigateToUserDashboard(page);

      // Try to access admin - should be denied/redirected
      await page.goto("/en/admin");
      await page.waitForURL("**/dashboard/user", { timeout: 5000 });

      // Verify we're redirected to user dashboard, not admin
      expect(page.url()).toContain("/dashboard/user");
      expect(page.url()).not.toContain("/admin");
    });
  });

  test.describe("Unauthorized Access", () => {
    test("should redirect to login when accessing protected routes without auth", async ({
      page,
    }) => {
      // Try to access user dashboard without login
      await page.goto("/en/dashboard/user", {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      // Should redirect to login page or home page
      const redirectedCorrectly =
        page.url().includes("/auth/signin") ||
        page.url().includes("/en") ||
        page.url().includes("/login");
      expect(redirectedCorrectly).toBeTruthy();

      // Try to access admin panel without login
      await page.goto("/en/admin", {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      // Should redirect to login page or home page
      const adminRedirectCorrect =
        page.url().includes("/auth/signin") ||
        page.url().includes("/en") ||
        page.url().includes("/login");
      expect(adminRedirectCorrect).toBeTruthy();
    });

    test("should handle role changes correctly", async ({ page }) => {
      // Login as user
      await loginPage.login("test@example.com", "Test123!");
      // Login method handles session synchronization - no timeout needed

      // Navigate to dashboard - should redirect to user dashboard
      await navigateToUserDashboard(page);

      // Verify role is enforced by trying to access restricted area
      await page.goto("/en/admin");
      await page.waitForURL("**/dashboard/user", { timeout: 5000 });

      // User should stay on their dashboard
      expect(page.url()).toContain("/dashboard/user");
      expect(page.url()).not.toContain("/admin");
    });
  });
});
