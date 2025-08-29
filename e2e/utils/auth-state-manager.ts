/**
 * Reliable Authentication State Manager for E2E Tests
 * Always verifies actual browser state instead of relying on internal tracking
 */

import { Page } from "@playwright/test";

export type AuthState =
  | "logged-out"
  | "user"
  | "admin"
  | "pro-user"
  | "unverified";

interface TestUser {
  email: string;
  password: string;
  role: string;
  verified: boolean;
}

export class AuthStateManager {
  // Test user configurations
  private static readonly TEST_USERS: Record<AuthState, TestUser | null> = {
    "logged-out": null,
    user: {
      email: "test@example.com",
      password: "Test123!",
      role: "USER",
      verified: true,
    },
    admin: {
      email: "admin@example.com",
      password: "Admin123!",
      role: "ADMIN",
      verified: true,
    },
    "pro-user": {
      email: "prouser@example.com",
      password: "Pro123!",
      role: "PRO_USER",
      verified: true,
    },
    unverified: {
      email: "unverified@example.com",
      password: "Unverified123!",
      role: "USER",
      verified: false,
    },
  };

  /**
   * Ensure authentication state by always verifying actual browser state
   */
  static async ensureAuthState(
    page: Page,
    desiredState: AuthState,
  ): Promise<void> {
    console.log(`🔧 AuthState: Desired=${desiredState}`);

    // Always detect actual browser state first
    console.log(`🔍 Step 1: Detecting actual browser state...`);
    const actualState = await this.detectActualAuthState(page);
    console.log(`🔍 Detected actual browser state: ${actualState}`);

    // If we're already in the desired state, verify page consistency
    if (actualState === desiredState) {
      console.log(
        `✅ Already in correct state (${desiredState}) - ensuring page consistency`,
      );
      await this.ensurePageConsistency(page);
      console.log(`✅ ensureAuthState completed - already in desired state`);
      return;
    }

    // Always perform thorough logout first if we need to change state
    if (actualState !== "logged-out") {
      console.log(
        `🧹 Step 2: Performing thorough logout from ${actualState} state`,
      );
      await this.thoroughLogout(page);
      console.log(`✅ Logout completed`);
    } else {
      console.log(`ℹ️ Step 2: Already logged out, skipping logout step`);
    }

    // If desired state is logged-out, we're done
    if (desiredState === "logged-out") {
      console.log(`✅ Successfully ensured logged-out state`);
      return;
    }

    // Perform fresh login to desired state
    console.log(`🔐 Step 3: Performing fresh login to ${desiredState} state`);
    await this.freshLogin(page, desiredState);
    console.log(
      `✅ ensureAuthState completed - fresh login to ${desiredState}`,
    );
  }

  /**
   * Detect the actual authentication state from browser session - simplified version
   */
  private static async detectActualAuthState(page: Page): Promise<AuthState> {
    console.log(`🔍 Starting robust auth state detection with retry logic...`);

    // Retry logic for session detection (up to 3 attempts with shorter delays)
    const maxRetries = 3;
    const baseDelay = 500; // 500ms base delay

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `🔍 Attempt ${attempt}/${maxRetries}: Checking session state`,
        );

        // Check session via API call directly (no navigation needed)
        const sessionResponse = await page.request.get("/api/auth/session");
        console.log(
          `🔍 Session API response status: ${sessionResponse.status()}`,
        );

        if (!sessionResponse.ok()) {
          console.log(
            `❌ Session API failed with status: ${sessionResponse.status()}`,
          );
          if (attempt === maxRetries) {
            return "logged-out";
          }
          console.log(`⏳ Retrying in ${baseDelay}ms...`);
          await page.waitForTimeout(baseDelay);
          continue;
        }

        const sessionData = await sessionResponse.json();
        console.log(
          `🔍 Session data:`,
          sessionData
            ? JSON.stringify(sessionData).substring(0, 200) + "..."
            : "null",
        );

        if (!sessionData?.user?.email) {
          console.log(
            `❌ No user email in session data - user appears logged out`,
          );
          if (attempt === maxRetries) {
            return "logged-out";
          }
          console.log(`⏳ Retrying in ${baseDelay}ms...`);
          await page.waitForTimeout(baseDelay);
          continue;
        }

        // Determine state based on user email and role
        const email = sessionData.user.email;
        const role = sessionData.user.role;
        console.log(`✅ Found authenticated user: ${email} with role: ${role}`);

        if (email === "admin@example.com") return "admin";
        if (email === "prouser@example.com" || email === "2fa@example.com")
          return "pro-user";
        if (email === "unverified@example.com") return "unverified";
        if (email === "test@example.com") return "user";

        // Default to user for any other authenticated state
        console.log(`✅ Detected auth state: user (default for ${email})`);
        return "user";
      } catch (error) {
        console.log(
          `⚠️ Auth state detection attempt ${attempt} failed: ${error}`,
        );
        if (attempt === maxRetries) {
          console.log(
            `❌ All ${maxRetries} attempts failed, returning logged-out`,
          );
          return "logged-out";
        }
        console.log(`⏳ Retrying in ${baseDelay}ms...`);
        await page.waitForTimeout(baseDelay);
      }
    }

    return "logged-out";
  }

  /**
   * Ensure page is in consistent state for current authentication
   */
  private static async ensurePageConsistency(page: Page): Promise<void> {
    // Navigate to home page for consistency
    const currentUrl = page.url();
    if (!currentUrl.includes("/en")) {
      await page.goto("/en");
      await page.waitForTimeout(1000);
    }
  }

  /**
   * Perform thorough logout with complete session cleanup
   */
  private static async thoroughLogout(page: Page): Promise<void> {
    console.log(`🧹 Performing thorough logout...`);

    try {
      // Step 1: API logout
      await page.goto("/api/auth/signout");
      await page.waitForTimeout(2000);

      // Step 2: Clear all browser storage
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
        // Clear any auth cookies
        document.cookie.split(";").forEach((cookie) => {
          const eqPos = cookie.indexOf("=");
          const name =
            eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=localhost`;
        });
      });

      // Step 3: Force page refresh to clear any remaining state
      await page.goto("/en?clean=" + Date.now(), { waitUntil: "networkidle" });
      await page.waitForTimeout(2000);

      // Step 4: Verify logout by checking for login elements
      const hasLoginElements = await page
        .locator(
          'button:has-text("Sign in"), [data-testid="sign-in-with-email-toggle"], text="Welcome to Our App"',
        )
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (!hasLoginElements) {
        throw new Error("Logout verification failed - no login elements found");
      }

      console.log(`✅ Thorough logout completed and verified`);
    } catch (error) {
      console.log(`⚠️ Logout error: ${error}, attempting force refresh`);
      // Nuclear option: clear everything and refresh
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = "/en?force=" + Date.now();
      });
      await page.waitForTimeout(3000);
    }
  }

  /**
   * Perform fresh login with complete setup
   */
  private static async freshLogin(page: Page, state: AuthState): Promise<void> {
    console.log(
      `🔐 [FRESHLOGIN] Starting fresh login process for state: ${state}`,
    );
    const user = this.TEST_USERS[state];
    if (!user) {
      console.log(`❌ [FRESHLOGIN] No test user found for state: ${state}`);
      return;
    }

    console.log(`🔐 [FRESHLOGIN] Fresh login to ${state} (${user.email})`);

    try {
      // Ensure we're on home page
      console.log(`🔐 [FRESHLOGIN] Step 1: Navigating to home page`);
      await page.goto("/en");
      await page.waitForTimeout(1000);
      console.log(`✅ [FRESHLOGIN] Navigation completed`);

      // Perform authentication via UI
      console.log(`🔐 [FRESHLOGIN] Step 2: Starting authentication UI process`);
      await this.authenticateViaUI(page, user);
      console.log(`✅ [FRESHLOGIN] Authentication UI completed`);

      // Brief wait for authentication to start processing
      console.log(
        `⏳ [FRESHLOGIN] Step 3: Waiting for authentication to start processing (2000ms)...`,
      );
      await page.waitForTimeout(2000); // Reduced wait time, rely on retry logic
      console.log(
        `✅ [FRESHLOGIN] Initial wait completed, proceeding to verification`,
      );

      // Verify login was successful
      console.log(`🔍 [FRESHLOGIN] Step 4: Verifying login success`);
      const finalState = await this.detectActualAuthState(page);
      console.log(
        `🔍 [FRESHLOGIN] Final state after authentication: ${finalState}`,
      );

      if (finalState === state) {
        console.log(`✅ [FRESHLOGIN] Fresh login successful to ${state}`);
      } else {
        console.log(
          `❌ [FRESHLOGIN] Login verification failed: expected ${state}, got ${finalState}`,
        );
        throw new Error(
          `Login verification failed: expected ${state}, got ${finalState}`,
        );
      }
    } catch (error) {
      console.log(`❌ [FRESHLOGIN] Fresh login failed with error: ${error}`);
      throw error;
    }
  }

  /**
   * Authenticate via UI form with enhanced reliability
   */
  private static async authenticateViaUI(
    page: Page,
    user: TestUser,
  ): Promise<void> {
    console.log(`🔐 Authenticating ${user.email} via UI...`);

    try {
      // Wait for page to be fully loaded
      await page.waitForLoadState("networkidle");

      // Look for email toggle button with multiple strategies
      const emailToggleSelectors = [
        'button[data-testid="sign-in-with-email-toggle"]',
        'button:has-text("Sign in with Email")',
        'button:has-text("Iniciar sesión con Email")',
        'button:has-text("Se connecter avec Email")',
        'button:has-text("Mit E-Mail anmelden")',
        'button:has-text("Accedi con Email")',
      ];

      let emailFormVisible = false;

      // Check if email input is already visible
      try {
        await page.waitForSelector('input[id="email"]', { timeout: 2000 });
        emailFormVisible = true;
        console.log("✅ Email form already visible");
      } catch {
        // Email form not visible, try to find toggle
        for (const selector of emailToggleSelectors) {
          try {
            const toggle = page.locator(selector);
            if (await toggle.isVisible({ timeout: 1000 })) {
              console.log(`📧 Clicking email toggle: ${selector}`);
              await toggle.click();
              await page.waitForTimeout(1500);

              // Verify email form appeared
              await page.waitForSelector('input[id="email"]', {
                timeout: 3000,
              });
              emailFormVisible = true;
              break;
            }
          } catch {
            continue;
          }
        }
      }

      if (!emailFormVisible) {
        throw new Error("Could not make email form visible");
      }

      // Fill authentication form
      await page.fill('input[id="email"]', user.email);
      await page.waitForTimeout(500);
      await page.fill('input[id="password"]', user.password);
      await page.waitForTimeout(500);

      // Submit form
      const submitButton = page.locator('button[type="submit"]');
      console.log(`🔄 Clicking submit button for ${user.email}`);
      await submitButton.click();
      await page.waitForTimeout(1000); // Give form time to submit

      console.log(
        `🔄 Submitted login form for ${user.email}, waiting for response...`,
      );

      // Wait for authentication result with better error handling
      try {
        const result = await Promise.race([
          // Success indicators
          page
            .waitForSelector('[data-testid="authenticated-home"]', {
              timeout: 20000,
            })
            .then(() => "authenticated-home"),
          page
            .waitForSelector('[data-testid="go-to-dashboard-button"]', {
              timeout: 20000,
            })
            .then(() => "dashboard-button"),
          page
            .waitForURL("**/account", { timeout: 20000 })
            .then(() => "account-url"),
          page
            .waitForURL("**/dashboard/**", { timeout: 20000 })
            .then(() => "dashboard-url"),
          // Error indicators
          page
            .waitForSelector('[role="alert"]', { timeout: 20000 })
            .then(() => "error-alert"),
          page
            .waitForSelector('text="Invalid"', { timeout: 20000 })
            .then(() => "invalid-text"),
        ]);
        console.log(`📝 Authentication UI result: ${result} for ${user.email}`);

        // If we got an error indicator, throw an error
        if (result === "error-alert" || result === "invalid-text") {
          throw new Error(`Authentication failed: received ${result}`);
        }

        // Give additional time for session to be fully established
        console.log(`⏳ Waiting additional time for session establishment...`);
        await page.waitForTimeout(3000);
      } catch (raceError) {
        console.log(`⚠️ Authentication race condition result: ${raceError}`);
        // Still proceed but log the issue
      }

      console.log(`✅ Authentication UI completed for ${user.email}`);
    } catch (error) {
      console.log(`❌ Authentication UI failed for ${user.email}: ${error}`);
      throw error;
    }
  }

  /**
   * Reset all state (for test cleanup)
   */
  static resetState(): void {
    // No static state to reset in the new approach
    console.log("🔄 AuthStateManager state reset (no-op in reliable mode)");
  }

  /**
   * Create optimized beforeEach hook for tests
   */
  static createOptimizedBeforeEach(requiredState: AuthState) {
    return async ({ page }: { page: Page }) => {
      await this.ensureAuthState(page, requiredState);
    };
  }
}
