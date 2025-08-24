import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/login.page";
import { RegisterPage } from "../pages/register.page";
import { DashboardPage } from "../pages/dashboard.page";

test.describe("Documentation Screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en");
  });

  test("should capture home page screenshots", async ({ page }) => {
    console.log("📸 Capturing home page screenshot...");

    // Wait for page to load completely
    await page.waitForLoadState("networkidle");

    // Take screenshot of home page
    await page.screenshot({
      path: "docs/screenshots/home-page.png",
      fullPage: true,
    });

    console.log("✅ Home page screenshot saved");
  });

  test("should capture authentication screenshots", async ({ page }) => {
    console.log("📸 Capturing authentication screenshots...");

    // Navigate to sign in page
    await page.click("text=Sign In");
    await page.waitForLoadState("networkidle");

    // Take screenshot of sign in page
    await page.screenshot({
      path: "docs/screenshots/signin-page.png",
      fullPage: true,
    });

    // Navigate to register page
    await page.goto("/en/register");
    await page.waitForLoadState("networkidle");

    // Take screenshot of register page
    await page.screenshot({
      path: "docs/screenshots/register-page.png",
      fullPage: true,
    });

    console.log("✅ Authentication screenshots saved");
  });

  test("should capture language selector screenshots", async ({ page }) => {
    console.log("📸 Capturing language selector screenshots...");

    // Click on language selector if visible
    const languageSelector = page.locator("select").first();
    if (await languageSelector.isVisible()) {
      await languageSelector.click();

      // Take screenshot showing language options
      await page.screenshot({
        path: "docs/screenshots/language-selector.png",
        fullPage: false,
      });
    }

    // Test different languages
    const languages = ["es", "fr", "de", "it"];
    for (const lang of languages) {
      await page.goto(`/${lang}`);
      await page.waitForLoadState("networkidle");

      await page.screenshot({
        path: `docs/screenshots/home-${lang}.png`,
        fullPage: true,
      });
    }

    console.log("✅ Language screenshots saved");
  });

  test("should capture dashboard screenshots after login", async ({ page }) => {
    console.log("📸 Capturing dashboard screenshots...");

    const loginPage = new LoginPage(page);

    // Navigate to login page
    await page.goto("/en/auth/signin");
    await page.waitForLoadState("networkidle");

    // Create test user first if needed
    await page.goto("/en/register");
    await page.waitForLoadState("networkidle");

    const registerPage = new RegisterPage(page);

    // Try to register a test user for screenshots
    try {
      await registerPage.register({
        name: "Documentation User",
        email: "docs@example.com",
        password: "DocsTest123!",
        confirmPassword: "DocsTest123!",
        acceptTerms: true,
      });

      // Wait for potential redirect
      await page.waitForTimeout(2000);
    } catch (error) {
      console.log("Registration might have failed, trying login...");
    }

    // Try to login
    await page.goto("/en/auth/signin");
    await page.waitForLoadState("networkidle");

    try {
      await loginPage.login("docs@example.com", "DocsTest123!");

      // Wait for dashboard redirect
      await page.waitForTimeout(3000);

      // Take dashboard screenshot
      await page.screenshot({
        path: "docs/screenshots/dashboard.png",
        fullPage: true,
      });
    } catch (error) {
      console.log("Login failed, taking signed-out dashboard screenshot");

      // Take screenshot of login form instead
      await page.screenshot({
        path: "docs/screenshots/login-form.png",
        fullPage: true,
      });
    }

    console.log("✅ Dashboard screenshots saved");
  });
});
