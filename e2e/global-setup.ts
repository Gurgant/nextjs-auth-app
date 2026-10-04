import { request, type FullConfig } from "@playwright/test";
import { PrismaClient } from "../src/generated/prisma/index";
import bcrypt from "bcryptjs";
import CryptoJS from "crypto-js";
import * as dotenv from "dotenv";
import { requireEncryptionKey } from "../src/lib/env-rules";
import {
  assertNotDevelopmentDatabase,
  resolveE2EDatabaseUrl,
} from "./support/test-db";
import { warmUp } from "./support/warm-up";

// Resolved by playwright.config.ts before .env is loaded below.
const E2E_DATABASE_URL = resolveE2EDatabaseUrl();

// Load .env WITHOUT overriding variables already present in the environment.
// Only needed for ENCRYPTION_KEY (the .env DATABASE_URL is the development DB
// and is deliberately not used here): seeded 2FA secrets must be encrypted with the same
// key the app uses, or TOTP validation can never succeed. Keep the key in .env
// (not only in .env.local), since this file reads .env alone.
dotenv.config();

/**
 * Global setup for Playwright E2E tests
 * Runs once before all tests
 */
async function globalSetup(config: FullConfig) {
  console.log("🚀 Starting Playwright global setup...");

  const baseURL = config.projects[0].use?.baseURL || "http://localhost:3000";

  // Set environment variables for tests
  if (!process.env.NODE_ENV) {
    (process.env as any).NODE_ENV = "test";
  }
  process.env.NEXTAUTH_URL = baseURL;
  process.env.NEXTAUTH_SECRET =
    process.env.NEXTAUTH_SECRET || "test-secret-for-e2e";

  // Never reset the development database (the one .env points at).
  assertNotDevelopmentDatabase(E2E_DATABASE_URL);
  const prisma = new PrismaClient({
    datasources: { db: { url: E2E_DATABASE_URL } },
  });

  try {
    // Connect to database
    await prisma.$connect();
    console.log("Connected to test database");

    // Clean database
    await cleanDatabase(prisma);
    console.log("Cleaned test database");

    // Seed test data
    await seedTestData(prisma);
    console.log("Seeded test data");
  } catch (error) {
    console.error("Global setup failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }

  // Compile every route the suite visits before the first test, so that no
  // test pays a `next dev` compile inside one of its own waits (see
  // e2e/support/warm-up.ts). The requests carry no session and follow no
  // redirect; `Connection: close` for the reason given in e2e/support/app.ts.
  const api = await request.newContext({ baseURL });
  try {
    await warmUp({
      log: console.log,
      get: async (path, timeoutMs) => {
        const response = await api.get(path, {
          maxRedirects: 0,
          timeout: timeoutMs,
          headers: { Connection: "close" },
        });
        return response.status();
      },
    });
  } finally {
    await api.dispose();
  }

  console.log("Playwright global setup complete");
}

/**
 * Clean all test data from database
 */
async function cleanDatabase(prisma: PrismaClient) {
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany(),
    prisma.emailVerificationToken.deleteMany(),
    prisma.securityEvent.deleteMany(),
    prisma.account.deleteMany(),
    prisma.session.deleteMany(),
    prisma.revokedSession.deleteMany(),
    prisma.verificationToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

/**
 * Seed test data for E2E tests
 */
async function seedTestData(prisma: PrismaClient) {
  // Create test users with verified password hashing
  console.log("🔐 Creating password hash for test@example.com...");
  const testPassword = "Test123!";
  const testPasswordHash = await bcrypt.hash(testPassword, 12);

  const testUsers = [
    {
      email: "test@example.com",
      name: "Test User",
      password: testPasswordHash,
      emailVerified: new Date(),
      role: "USER" as const,
      twoFactorEnabled: false, // Explicitly disable 2FA for regular test user
    },
    {
      email: "admin@example.com",
      name: "Admin User",
      password: await bcrypt.hash("Admin123!", 12),
      emailVerified: new Date(),
      role: "ADMIN" as const,
      twoFactorEnabled: false, // Explicitly disable 2FA for admin test user
    },
    {
      email: "prouser@example.com",
      name: "Pro User",
      password: await bcrypt.hash("Pro123!", 12),
      emailVerified: new Date(),
      role: "PRO_USER" as const,
      twoFactorEnabled: false, // Explicitly disable 2FA for pro test user
    },
    {
      email: "unverified@example.com",
      name: "Unverified User",
      password: await bcrypt.hash("Unverified123!", 12),
      emailVerified: null,
      role: "USER" as const,
      twoFactorEnabled: false, // Explicitly disable 2FA for unverified test user
    },
    {
      email: "2fa@example.com",
      name: "2FA User",
      password: await bcrypt.hash("2FA123!", 12),
      emailVerified: new Date(),
      twoFactorEnabled: true,
      // Encrypted at rest, exactly as the app stores it (see src/lib/security.ts).
      // The plaintext test secret is JBSWY3DPEHPK3PXP; e2e specs generate codes
      // from it with otplib.
      twoFactorSecret: CryptoJS.AES.encrypt(
        "JBSWY3DPEHPK3PXP",
        requireEncryptionKey(),
      ).toString(),
      role: "PRO_USER" as const,
    },
  ];

  for (const userData of testUsers) {
    console.log(`🔄 Creating user: ${userData.email}`);
    // Create fresh user for clean test isolation
    const user = await prisma.user.create({ data: userData });
    console.log(`✅ Created user: ${userData.email}`);

    // Create account for each user
    await prisma.account.create({
      data: {
        userId: user.id,
        type: "credentials",
        provider: "credentials",
        providerAccountId: user.email,
      },
    });
    console.log(`✅ Created account for: ${userData.email}`);
  }

  // Create OAuth test user
  const oauthUser = await prisma.user.create({
    data: {
      email: "oauth@example.com",
      name: "OAuth User",
      emailVerified: new Date(),
      image: "https://example.com/avatar.jpg",
      role: "USER" as const,
    },
  });

  await prisma.account.create({
    data: {
      userId: oauthUser.id,
      type: "oauth",
      provider: "google",
      providerAccountId: "google-123456",
      access_token: "test-access-token",
      refresh_token: "test-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "Bearer",
      scope: "email profile",
    },
  });
}

export default globalSetup;
