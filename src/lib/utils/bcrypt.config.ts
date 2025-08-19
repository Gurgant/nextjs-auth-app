/**
 * Bcrypt Configuration
 * Optimized for different environments
 */

// Determine if we're in a test environment
const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined

// Use fewer rounds for tests (faster) and more for production (more secure)
export const BCRYPT_ROUNDS = isTestEnvironment ? 4 : 12

// Export a helper to get the appropriate number of rounds
export function getBcryptRounds(): number {
  if (process.env.BCRYPT_ROUNDS) {
    const rounds = parseInt(process.env.BCRYPT_ROUNDS, 10)
    if (!isNaN(rounds) && rounds >= 4 && rounds <= 15) {
      return rounds
    }
  }
  return BCRYPT_ROUNDS
}

/**
 * Log the configuration (useful for debugging)
 */
if (process.env.DEBUG === 'true') {
  console.log(`🔐 Bcrypt configuration:`)
  console.log(`   Environment: ${isTestEnvironment ? 'TEST' : 'PRODUCTION'}`)
  console.log(`   Rounds: ${BCRYPT_ROUNDS}`)
  console.log(`   Expected hash time: ${isTestEnvironment ? '~10ms' : '~250ms'}`)
}