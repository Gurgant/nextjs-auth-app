import { defineConfig, devices } from "@playwright/test";
import * as os from "os";
import { resolveE2EDatabaseUrl } from "./e2e/support/test-db";

// Resolved before anything reads .env (see e2e/support/test-db.ts) and shared
// with global setup/teardown and the dev server through the environment.
const E2E_DATABASE_URL = resolveE2EDatabaseUrl();
process.env.E2E_DATABASE_URL = E2E_DATABASE_URL;

/**
 * Playwright configuration.
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
  // No retries, in CI either: a test that only passes on a second attempt is
  // unstable and has to show up as a failure, not be hidden by a retry.
  retries: 0,

  // Optimized worker configuration for performance
  workers: process.env.CI
    ? 1 // Single worker in CI for stability
    : process.env.PLAYWRIGHT_WORKERS
      ? parseInt(process.env.PLAYWRIGHT_WORKERS)
      : Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2))), // Smart worker count based on CPU cores

  // Reporter configuration
  // In CI: one line per test plus the totals in the log, and GitHub annotations.
  reporter: process.env.CI
    ? [["list"], ["github"]]
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

    // Trace settings (there are no retries, so keep the trace of a failure)
    trace: "retain-on-failure",
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

  // Web server for development and CI.
  // Environment is passed ONLY via `env` (inline VAR=value prefixes are
  // bash-only and break on Windows). The database is E2E_DATABASE_URL: the
  // shell's DATABASE_URL or the docker test DB (port 5433), never the .env one.
  //
  // ⚠️ Never set NODE_ENV=test on the dev server: next.config.ts would serve
  // the production CSP (no 'unsafe-eval'), which silently breaks hydration in
  // `next dev` — pages render but nothing is interactive.
  webServer: {
    command: "pnpm run dev",
    url: "http://localhost:3000",
    // A dev server you started yourself reads .env (your development DB), so
    // reusing it is opt-in: E2E_REUSE_SERVER=1, only for a server started on the
    // test database. By default a busy :3000 is an error, not a silent reuse.
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    timeout: process.env.CI ? 180 * 1000 : 120 * 1000, // Longer timeout in CI
    stdout: "pipe",
    stderr: "pipe",
    // Everything else (session secret, ENCRYPTION_KEY, NEXTAUTH_URL) comes from
    // the environment the run already has: .env locally, the workflow in CI.
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
    },
  },

  // Output directory
  outputDir: "test-results/",
});
