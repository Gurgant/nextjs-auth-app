/**
 * Jest Setup for Integration Tests
 * This setup is used for tests that need database access
 */

// Import base setup
require("./jest.setup");

// Import database setup utilities
const {
  ensureSchema,
  cleanDatabase,
  disconnectDatabase,
} = require("./src/test/setup/database.setup");

// Ensure test database URL is used
process.env.DATABASE_URL =
  "postgresql://postgres:postgres123@localhost:5433/nextjs_auth_db";

// Setup before all tests
beforeAll(async () => {
  console.log("🔧 Setting up test database...");
  try {
    // Ensure schema exists
    await ensureSchema();
    console.log("✅ Test database ready");
  } catch (error) {
    console.error("❌ Failed to setup test database:", error);
    throw error;
  }
}, 30000); // 30 second timeout for database setup

// Clean database before each test for isolation
beforeEach(async () => {
  await cleanDatabase();
}, 10000); // 10 second timeout for cleanup

// Disconnect after all tests
afterAll(async () => {
  await disconnectDatabase();
}, 10000);

// Set longer timeout for integration tests
jest.setTimeout(30000);
