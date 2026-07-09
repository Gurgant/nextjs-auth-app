import { defineConfig, devices } from "@playwright/test";
import * as os from "os";

/**
 * Modern Playwright Configuration - Latest Version Compatible
 * Fixed for Next.js 15.5.0 TypeScript moduleResolution compatibility
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // Test directory and pattern
  testDir: "./e2e/tests",
  testMatch: "**/*.e2e.ts",

  // Optimized timeout settings for performance
  timeout: process.env.CI ? 90 * 1000 : 45 * 1000, // Shorter timeouts for faster failure detection

  // Expect timeout
  expect: {
    timeout: process.env.CI ? 15 * 1000 : 10 * 1000, // Faster expectations in local dev
  },

  // Intelligent parallel execution
  fullyParallel: true,

  // CI specific settings
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  // Optimized worker configuration for performance
  workers: process.env.CI
    ? 1 // Single worker in CI for stability
    : process.env.PLAYWRIGHT_WORKERS
      ? parseInt(process.env.PLAYWRIGHT_WORKERS)
      : Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2))), // Smart worker count based on CPU cores

  // Reporter configuration
  reporter: process.env.CI
    ? "github"
    : [
        ["list"],
        ["html", { outputFolder: "playwright-report", open: "never" }],
      ],

  // Global setup for database seeding and test environment
  globalSetup: require.resolve("./e2e/global-setup.ts"),

  // Global teardown for database cleanup after all tests
  globalTeardown: require.resolve("./e2e/global-teardown.ts"),

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
  webServer: process.env.DOCS_SCREENSHOTS
    ? // Production build for stable documentation screenshots
      {
        command:
          'DATABASE_URL="postgresql://postgres:postgres123@localhost:5433/nextjs_auth_db" pnpm build && pnpm start',
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120000, // 2 minutes for build + start
        stdout: "pipe",
        stderr: "pipe",
        env: {
          DATABASE_URL:
            "postgresql://postgres:postgres123@localhost:5433/nextjs_auth_db",
          NODE_ENV: "production",
          NEXTAUTH_SECRET: "docs-screenshot-secret-key",
          NEXTAUTH_URL: "http://localhost:3000",
          PORT: "3000",
        },
      }
    : // Development server for regular tests
      {
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
