import { FullConfig } from '@playwright/test'
import { PrismaClient } from '@/generated/prisma'
import bcrypt from 'bcryptjs'

/**
 * Global setup for Playwright E2E tests
 * Runs once before all tests
 */
async function globalSetup(config: FullConfig) {
  console.log('<� Starting Playwright global setup...')
  
  // Set environment variables for tests
  Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', writable: true })
  process.env.NEXTAUTH_URL = config.projects[0].use?.baseURL || 'http://localhost:3000'
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'test-secret-for-e2e'
  
  // Initialize database
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL || 'postgresql://postgres:postgres123@localhost:5433/nextjs_auth_db'
      }
    }
  })
  
  try {
    // Connect to database
    await prisma.$connect()
    console.log(' Connected to test database')
    
    // Clean database
    await cleanDatabase(prisma)
    console.log('>� Cleaned test database')
    
    // Seed test data
    await seedTestData(prisma)
    console.log('<1 Seeded test data')
    
  } catch (error) {
    console.error('L Global setup failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
  
  console.log(' Playwright global setup complete')
}

/**
 * Clean all test data from database
 */
async function cleanDatabase(prisma: PrismaClient) {
  await prisma.$transaction([
    prisma.accountLinkRequest.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.emailVerificationToken.deleteMany(),
    prisma.securityEvent.deleteMany(),
    prisma.account.deleteMany(),
    prisma.session.deleteMany(),
    prisma.verificationToken.deleteMany(),
    prisma.user.deleteMany(),
  ])
}

/**
 * Seed test data for E2E tests
 */
async function seedTestData(prisma: PrismaClient) {
  // Create test users
  const testUsers = [
    {
      email: 'test@example.com',
      name: 'Test User',
      password: await bcrypt.hash('Test123!', 10),
      emailVerified: new Date(),
    },
    {
      email: 'admin@example.com',
      name: 'Admin User',
      password: await bcrypt.hash('Admin123!', 10),
      emailVerified: new Date(),
    },
    {
      email: 'unverified@example.com',
      name: 'Unverified User',
      password: await bcrypt.hash('Unverified123!', 10),
      emailVerified: null,
    },
    {
      email: '2fa@example.com',
      name: '2FA User',
      password: await bcrypt.hash('2FA123!', 10),
      emailVerified: new Date(),
      twoFactorEnabled: true,
      twoFactorSecret: 'JBSWY3DPEHPK3PXP', // Test secret
    },
  ]
  
  for (const userData of testUsers) {
    const user = await prisma.user.create({
      data: userData
    })
    
    // Create account for each user
    await prisma.account.create({
      data: {
        userId: user.id,
        type: 'credentials',
        provider: 'credentials',
        providerAccountId: user.email,
      }
    })
  }
  
  // Create OAuth test user
  const oauthUser = await prisma.user.create({
    data: {
      email: 'oauth@example.com',
      name: 'OAuth User',
      emailVerified: new Date(),
      image: 'https://example.com/avatar.jpg'
    }
  })
  
  await prisma.account.create({
    data: {
      userId: oauthUser.id,
      type: 'oauth',
      provider: 'google',
      providerAccountId: 'google-123456',
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'Bearer',
      scope: 'email profile',
    }
  })
}

export default globalSetup