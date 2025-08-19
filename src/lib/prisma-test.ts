/**
 * Prisma Client for Testing
 * Properly configured with connection pooling for tests
 */

import { PrismaClient } from '@/lib/types/prisma'

// Determine test database URL
const TEST_DATABASE_URL = 
  process.env.DATABASE_URL?.includes('5433') 
    ? process.env.DATABASE_URL 
    : 'postgresql://postgres:postgres123@localhost:5433/nextjs_auth_db'

// Configure connection pool for tests
const connectionLimit = process.env.CI ? 2 : 5 // Fewer connections in CI

// Create a singleton instance for tests
let prismaTestInstance: PrismaClient | null = null

export function getPrismaTestClient(): PrismaClient {
  if (!prismaTestInstance) {
    prismaTestInstance = new PrismaClient({
      datasources: {
        db: {
          url: `${TEST_DATABASE_URL}?connection_limit=${connectionLimit}&pool_timeout=10`
        }
      },
      log: process.env.DEBUG === 'true' 
        ? ['query', 'error', 'warn'] 
        : ['error'],
    })
  }
  return prismaTestInstance
}

// Export the singleton instance
export const prismaTest = getPrismaTestClient()

// Cleanup function to properly disconnect
export async function cleanupPrismaTest() {
  if (prismaTestInstance) {
    await prismaTestInstance.$disconnect()
    prismaTestInstance = null
  }
}

// Ensure connections are cleaned up on process exit
process.on('beforeExit', async () => {
  await cleanupPrismaTest()
})

// Handle unexpected shutdowns
process.on('SIGINT', async () => {
  await cleanupPrismaTest()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await cleanupPrismaTest()
  process.exit(0)
})