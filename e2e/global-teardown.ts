import { FullConfig } from "@playwright/test";
import { PrismaClient } from "../src/generated/prisma/index";
import {
  assertNotDevelopmentDatabase,
  resolveE2EDatabaseUrl,
} from "./support/test-db";

/**
 * Global teardown for Playwright E2E tests
 * Runs once after all tests complete - cleans test database
 */
async function globalTeardown(config: FullConfig) {
  console.log("🧹 Starting Playwright global teardown...");

  // Same database as the setup (E2E_DATABASE_URL, set by playwright.config.ts);
  // never the development database.
  const url = resolveE2EDatabaseUrl();
  assertNotDevelopmentDatabase(url);
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    // Connect to test database
    await prisma.$connect();
    console.log("🔗 Connected to test database for cleanup");

    // Clean all test data from database
    await cleanTestDatabase(prisma);
    console.log("🧹 Test database cleaned successfully");
  } catch (error) {
    console.error("❌ Global teardown failed:", error);
    // Don't throw - teardown failures shouldn't break builds
  } finally {
    await prisma.$disconnect();
    console.log("🔌 Disconnected from test database");
  }

  console.log("✅ Playwright global teardown complete");
}

/**
 * Clean all test data from database after E2E test completion
 */
async function cleanTestDatabase(prisma: PrismaClient) {
  console.log("🗑️ Cleaning test database tables...");

  await prisma.$transaction([
    prisma.accountLinkRequest.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.emailVerificationToken.deleteMany(),
    prisma.securityEvent.deleteMany(),
    prisma.account.deleteMany(),
    prisma.session.deleteMany(),
    prisma.revokedSession.deleteMany(),
    prisma.verificationToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  console.log("✅ All test data removed from database");
}

export default globalTeardown;
