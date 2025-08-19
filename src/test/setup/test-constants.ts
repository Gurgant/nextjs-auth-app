/**
 * Test Constants
 * Shared constants for all test files
 */

// Bcrypt rounds for testing - significantly faster than production
export const TEST_BCRYPT_ROUNDS = 4

// Default test passwords
export const TEST_PASSWORD = 'Test123!'
export const TEST_PASSWORD_HASH = '$2a$04$dummy.hash.for.testing' // Pre-computed for mocking

// Test timeouts
export const DEFAULT_TEST_TIMEOUT = 5000
export const INTEGRATION_TEST_TIMEOUT = 10000
export const BULK_OPERATION_TIMEOUT = 120000

// Test user data
export const TEST_USER = {
  id: 'test-user-id',
  name: 'Test User',
  email: 'test@example.com',
  password: TEST_PASSWORD
}

// Database cleanup settings
export const CLEANUP_BATCH_SIZE = 100
export const CLEANUP_TIMEOUT = 5000