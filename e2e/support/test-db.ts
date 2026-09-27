import fs from "fs";
import path from "path";
import dotenv from "dotenv";

/**
 * The single database an E2E run may seed and wipe (global setup/teardown)
 * and hand to the dev server it starts.
 *
 * Resolved once, in playwright.config.ts, BEFORE anything reads .env: the
 * shell's DATABASE_URL (as passed to `pnpm test:e2e`) or the docker test DB on
 * 5433 — never the .env value, which points at the development database. The
 * result is exported as E2E_DATABASE_URL so every process of the run agrees.
 */
export const DEFAULT_TEST_DATABASE_URL =
  "postgresql://postgres:postgres123@127.0.0.1:5433/nextjs_auth_db";

export function resolveE2EDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.E2E_DATABASE_URL || env.DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
}

/**
 * Refuse to reset the database that .env points at: that is the development
 * database, and the E2E setup/teardown delete every row they touch.
 */
export function assertNotDevelopmentDatabase(
  url: string,
  envFile: string = path.join(process.cwd(), ".env"),
): void {
  if (!fs.existsSync(envFile)) return;
  const devUrl = dotenv.parse(fs.readFileSync(envFile)).DATABASE_URL;
  if (devUrl && devUrl.trim() === url.trim()) {
    throw new Error(
      "E2E refuses to reset the database that .env's DATABASE_URL points at " +
        "(your development data). Run it against the test database, e.g. " +
        "DATABASE_URL=postgresql://postgres:postgres123@127.0.0.1:5433/nextjs_auth_db pnpm test:e2e",
    );
  }
}
