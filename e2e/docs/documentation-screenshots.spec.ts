import { test, expect } from "@playwright/test";

/**
 * Documentation Screenshots Generator
 *
 * Generates deterministic, stable screenshots for README documentation
 * Ensures no loading states, animations, or inconsistent UI elements
 */
test.describe("Documentation Screenshots", () => {
  test.beforeEach(async ({ page }) => {
    // Configure page for stable screenshots
    await page.emulateMedia({
      colorScheme: "light",
      reducedMotion: "reduce",
    });

    // Disable all animations and transitions for deterministic captures
    await page.addStyleTag({
      content: `
        *, *::before, *::after { 
          animation: none !important; 
          transition: none !important;
          animation-duration: 0s !important;
          transition-duration: 0s !important;
        }
      `,
    });

    // Set consistent viewport
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("should capture hero page screenshot", async ({ page }) => {
    console.log("📸 Capturing hero page screenshot...");

    // Navigate to home page
    await page.goto("/en");

    // Wait for page to be fully loaded with stable content
    await page.waitForLoadState("networkidle");

    // Wait for key elements to be visible (stable selectors)
    await expect(page.locator("h1")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("main")).toBeVisible();

    // Additional wait to ensure no skeleton/loading states
    await page.waitForTimeout(2000);

    // Take hero screenshot
    await page.screenshot({
      path: "docs/screenshots/hero.png",
      fullPage: true,
      animations: "disabled",
    });

    console.log("✅ Hero page screenshot saved to docs/screenshots/hero.png");
  });

  test("should capture sign-in page screenshot", async ({ page }) => {
    console.log("📸 Capturing sign-in page screenshot...");

    // Navigate to sign-in page
    await page.goto("/en/auth/signin");

    // Wait for page load and form elements
    await page.waitForLoadState("networkidle");
    await expect(page.locator("form")).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="email"]')).toBeVisible();

    // Wait for OAuth buttons to load
    await expect(
      page
        .locator("text=Sign in with Google")
        .or(page.locator('[data-provider="google"]')),
    ).toBeVisible();

    // Additional stability wait
    await page.waitForTimeout(2000);

    // Take sign-in screenshot
    await page.screenshot({
      path: "docs/screenshots/signin.png",
      fullPage: true,
      animations: "disabled",
    });

    console.log(
      "✅ Sign-in page screenshot saved to docs/screenshots/signin.png",
    );
  });

  test("should capture protected dashboard screenshot", async ({ page }) => {
    console.log("📸 Capturing protected dashboard screenshot...");

    try {
      // Try to mock session first (if available)
      await page.goto("/api/dev/mock-session?role=USER");
    } catch (error) {
      console.log("Mock session endpoint not available, continuing...");
    }

    // Navigate to dashboard
    await page.goto("/en/dashboard");

    // Wait for page load
    await page.waitForLoadState("networkidle");

    // Check if we're logged in (dashboard content visible) or redirected to signin
    const isSignInPage = await page.locator('input[type="email"]').isVisible();

    if (isSignInPage) {
      console.log("Not authenticated, taking sign-in form screenshot instead");

      await expect(page.locator("form")).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: "docs/screenshots/protected.png",
        fullPage: true,
        animations: "disabled",
      });
    } else {
      // We're on dashboard, wait for dashboard content
      await expect(page.locator("main")).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: "docs/screenshots/protected.png",
        fullPage: true,
        animations: "disabled",
      });
    }

    console.log(
      "✅ Protected page screenshot saved to docs/screenshots/protected.png",
    );
  });

  test("should capture admin page screenshot", async ({ page }) => {
    console.log("📸 Capturing admin page screenshot...");

    try {
      // Try to mock ADMIN session
      await page.goto("/api/dev/mock-session?role=ADMIN");
    } catch (error) {
      console.log("Mock session endpoint not available, continuing...");
    }

    // Navigate to admin page
    await page.goto("/en/admin");

    // Wait for page load
    await page.waitForLoadState("networkidle");

    // Wait for main content or check if redirected
    await expect(page.locator("main")).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // Take admin screenshot
    await page.screenshot({
      path: "docs/screenshots/admin.png",
      fullPage: true,
      animations: "disabled",
    });

    console.log("✅ Admin page screenshot saved to docs/screenshots/admin.png");
  });

  test("should capture locale gallery screenshots", async ({ page }) => {
    console.log("📸 Capturing locale gallery screenshots...");

    const locales = [
      { code: "en", name: "English" },
      { code: "es", name: "Spanish" },
      { code: "fr", name: "French" },
      { code: "de", name: "German" },
      { code: "it", name: "Italian" },
    ];

    for (const locale of locales) {
      console.log(`📸 Capturing ${locale.name} (${locale.code}) screenshot...`);

      // Navigate to localized home page
      await page.goto(`/${locale.code}`);

      // Wait for page load and localized content
      await page.waitForLoadState("networkidle");
      await expect(page.locator("h1")).toBeVisible({ timeout: 10000 });
      await expect(page.locator("main")).toBeVisible();

      // Additional wait for stable content
      await page.waitForTimeout(2000);

      // Take locale-specific screenshot
      await page.screenshot({
        path: `docs/screenshots/locale-${locale.code}.png`,
        fullPage: true,
        animations: "disabled",
      });

      console.log(
        `✅ ${locale.name} screenshot saved to docs/screenshots/locale-${locale.code}.png`,
      );
    }
  });

  test("should capture dark mode screenshot (optional)", async ({ page }) => {
    console.log("📸 Capturing dark mode screenshot...");

    // Switch to dark mode
    await page.emulateMedia({
      colorScheme: "dark",
      reducedMotion: "reduce",
    });

    // Navigate to home page
    await page.goto("/en");

    // Wait for page load and dark theme application
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("main")).toBeVisible();

    // Additional wait for theme to stabilize
    await page.waitForTimeout(3000);

    // Take dark mode screenshot
    await page.screenshot({
      path: "docs/screenshots/dark-hero.png",
      fullPage: true,
      animations: "disabled",
    });

    console.log(
      "✅ Dark mode screenshot saved to docs/screenshots/dark-hero.png",
    );
  });

  test("should verify all screenshots were created", async ({ page }) => {
    console.log("🔍 Verifying screenshot files were created...");

    const requiredScreenshots = [
      "docs/screenshots/hero.png",
      "docs/screenshots/signin.png",
      "docs/screenshots/protected.png",
      "docs/screenshots/admin.png",
      "docs/screenshots/locale-en.png",
      "docs/screenshots/locale-es.png",
      "docs/screenshots/locale-fr.png",
      "docs/screenshots/locale-de.png",
      "docs/screenshots/locale-it.png",
      "docs/screenshots/dark-hero.png",
    ];

    const fs = require("fs");
    const path = require("path");

    for (const screenshotPath of requiredScreenshots) {
      const fullPath = path.resolve(screenshotPath);
      const exists = fs.existsSync(fullPath);

      if (exists) {
        const stats = fs.statSync(fullPath);
        console.log(
          `✅ ${screenshotPath} exists (${Math.round(stats.size / 1024)}KB)`,
        );
      } else {
        console.log(`❌ ${screenshotPath} missing`);
        throw new Error(
          `Required screenshot ${screenshotPath} was not created`,
        );
      }
    }

    console.log("🎉 All documentation screenshots created successfully!");
  });
});
