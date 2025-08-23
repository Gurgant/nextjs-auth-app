import { defineConfig, devices } from "@playwright/test";

/**
 * Modern Playwright Configuration - Latest Version Compatible
 * Fixed for Next.js 15.5.0 TypeScript moduleResolution compatibility
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // Test directory and pattern
  testDir: "./e2e/tests",
  testMatch: "**/*.e2e.ts",

  // Global timeout settings
  timeout: 60 * 1000,

  // Expect timeout
  expect: {
    timeout: 15 * 1000,
  },

  // Run tests in parallel
  fullyParallel: true,

  // CI specific settings
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Always use 1 worker to prevent port conflicts

  // Reporter configuration
  reporter: process.env.CI
    ? "github"
    : [
        ["list"],
        ["html", { outputFolder: "playwright-report", open: "never" }],
      ],

  // Global setup (temporarily disabled for debugging)
  // globalSetup: require.resolve('./e2e/global-setup.ts'),

  // Shared settings
  use: {
    // Base URL
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",

    // Trace settings
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",

    // Browser options
    headless: process.env.HEADED !== "true",
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,

    // Locale settings
    locale: "en-US",
    timezoneId: "America/New_York",
  },

  // Project configuration - focusing on Chromium for now
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Web server for development and CI
  webServer: {
    command:
      'DATABASE_URL="postgresql://postgres:postgres123@localhost:5433/nextjs_auth_db" pnpm run dev',
    url: "http://localhost:3000",
    reuseExistingServer: true, // Always reuse to prevent port conflicts
    timeout: process.env.CI ? 180 * 1000 : 120 * 1000, // Longer timeout in CI
    stdout: "pipe",
    stderr: "pipe",
    env: {
      DATABASE_URL:
        "postgresql://postgres:postgres123@localhost:5433/nextjs_auth_db",
      NODE_ENV: "test",
      // CI-specific optimizations
      ...(process.env.CI && {
        NEXTAUTH_SECRET: "ci-test-secret-key-for-testing-only",
        NEXTAUTH_URL: "http://localhost:3000",
        PORT: "3000",
      }),
    },
  },

  // Output directory
  outputDir: "test-results/",
});
