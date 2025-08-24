/**
 * Database Setup Utilities for Testing
 * Ensures proper test isolation and database cleanup
 */

import { PrismaClient } from "@/lib/types/prisma";

// Use test database URL
const TEST_DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres123@localhost:5433/nextjs_auth_db";

// Create a separate Prisma client for tests
export const prismaTest = new PrismaClient({
  datasources: {
    db: {
      url: TEST_DATABASE_URL,
    },
  },
  log: process.env.DEBUG === "true" ? ["query", "error", "warn"] : ["error"],
});

/**
 * Clean all data from database tables
 * Maintains referential integrity by deleting in correct order
 */
export async function cleanDatabase() {
  try {
    // Delete in order to respect foreign key constraints
    await prismaTest.securityEvent.deleteMany();
    await prismaTest.accountLinkRequest.deleteMany();
    await prismaTest.passwordResetToken.deleteMany();
    await prismaTest.emailVerificationToken.deleteMany();
    await prismaTest.verificationToken.deleteMany();
    await prismaTest.session.deleteMany();
    await prismaTest.account.deleteMany();
    await prismaTest.user.deleteMany();
  } catch (error) {
    console.error("Error cleaning database:", error);
    throw error;
  }
}

/**
 * Seed database with test data
 */
export async function seedTestData() {
  try {
    // Create test users
    // TODO: Implement role-based access control in the future
    // This would require adding a 'role' field to the User model in schema.prisma
    const testUser = await prismaTest.user.create({
      data: {
        email: "test@example.com",
        name: "Test User",
        password: "$2a$12$dummy.hashed.password", // Already hashed
        emailVerified: new Date(),
        // role: 'user', // TODO: Add when roles are implemented
      },
    });

    const adminUser = await prismaTest.user.create({
      data: {
        email: "admin@example.com",
        name: "Admin User",
        password: "$2a$12$dummy.hashed.password",
        emailVerified: new Date(),
        // role: 'admin', // TODO: Add when roles are implemented
      },
    });

    return { testUser, adminUser };
  } catch (error) {
    console.error("Error seeding test data:", error);
    throw error;
  }
}

/**
 * Reset database to clean state
 * Useful for integration tests
 */
export async function resetDatabase() {
  await cleanDatabase();
  return await seedTestData();
}

/**
 * Ensure database schema is up to date
 * Run before test suite starts
 */
export async function ensureSchema() {
  try {
    // Check if tables exist by trying to count users
    await prismaTest.user.count();
    console.log("✓ Database schema is ready");
  } catch (error) {
    console.error("Database schema not ready:", error);
    console.log("Run: pnpm db:push:test to set up test database");
    throw new Error("Test database not configured properly");
  }
}

/**
 * Disconnect from database
 * Call after all tests complete
 */
export async function disconnectDatabase() {
  await prismaTest.$disconnect();
}
