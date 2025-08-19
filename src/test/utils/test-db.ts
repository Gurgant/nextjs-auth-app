import { PrismaClient } from '@/lib/types/prisma'
import { factories } from './mock-factory'
import { generate } from './test-utils'

/**
 * Test database client
 */
export class TestDatabase {
  private static instance: TestDatabase
  private prisma: PrismaClient
  private transactionDepth = 0

  private constructor() {
    this.prisma = new PrismaClient({
      log: process.env.DEBUG_TESTS ? ['query', 'error', 'warn'] : []
    })
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TestDatabase {
    if (!this.instance) {
      this.instance = new TestDatabase()
    }
    return this.instance
  }

  /**
   * Get Prisma client
   */
  getClient(): PrismaClient {
    return this.prisma
  }

  /**
   * Connect to database
   */
  async connect(): Promise<void> {
    await this.prisma.$connect()
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect()
  }

  /**
   * Clear all data from database
   */
  async clear(): Promise<void> {
    const tableNames = await this.prisma.$queryRaw<
      Array<{ tablename: string }>
    >`SELECT tablename FROM pg_tables WHERE schemaname='public'`

    const tables = tableNames
      .map(({ tablename }) => tablename)
      .filter(name => name !== '_prisma_migrations')
      .map(name => `"public"."${name}"`)
      .join(', ')

    if (tables) {
      await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`)
    }
  }

  /**
   * Reset database sequences
   */
  async resetSequences(): Promise<void> {
    const sequences = await this.prisma.$queryRaw<
      Array<{ sequence_name: string }>
    >`SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'`

    for (const { sequence_name } of sequences) {
      await this.prisma.$executeRawUnsafe(
        `ALTER SEQUENCE "${sequence_name}" RESTART WITH 1`
      )
    }
  }

  /**
   * Seed database with test data
   */
  async seed(data?: {
    users?: number
    sessions?: number
    accounts?: number
  }): Promise<{
    users: any[]
    sessions: any[]
    accounts: any[]
  }> {
    const { users = 5, sessions = 3, accounts = 2 } = data || {}

    // Create users
    const createdUsers = []
    for (let i = 0; i < users; i++) {
      const user = factories.user.build()
      const created = await this.prisma.user.create({ data: user })
      createdUsers.push(created)
    }

    // Create sessions for first 3 users
    const createdSessions = []
    for (let i = 0; i < Math.min(sessions, createdUsers.length); i++) {
      const session = factories.session.valid(createdUsers[i].id)
      const created = await this.prisma.session.create({ data: session })
      createdSessions.push(created)
    }

    // Create accounts for first 2 users
    const createdAccounts = []
    for (let i = 0; i < Math.min(accounts, createdUsers.length); i++) {
      const account = factories.account.credentials(
        createdUsers[i].id,
        createdUsers[i].email
      )
      const created = await this.prisma.account.create({ data: account })
      createdAccounts.push(created)
    }

    return {
      users: createdUsers,
      sessions: createdSessions,
      accounts: createdAccounts
    }
  }

  /**
   * Create test user with all relations
   */
  async createTestUser(overrides?: {
    user?: Partial<any>
    withSession?: boolean
    withAccount?: boolean
    accountProvider?: string
  }): Promise<{
    user: any
    session?: any
    account?: any
  }> {
    const {
      user: userOverrides,
      withSession = true,
      withAccount = true,
      accountProvider = 'credentials'
    } = overrides || {}

    // Create user
    const userData = factories.user.build(userOverrides)
    const user = await this.prisma.user.create({ data: userData })

    // Create session if requested
    let session
    if (withSession) {
      const sessionData = factories.session.valid(user.id)
      session = await this.prisma.session.create({ data: sessionData })
    }

    // Create account if requested
    let account
    if (withAccount) {
      const accountData = 
        accountProvider === 'google'
          ? factories.account.google(user.id)
          : factories.account.credentials(user.id, user.email)
      account = await this.prisma.account.create({ data: accountData })
    }

    return { user, session, account }
  }

  /**
   * Begin transaction for test isolation
   */
  async beginTransaction(): Promise<void> {
    this.transactionDepth++
    await this.prisma.$executeRawUnsafe('BEGIN')
  }

  /**
   * Rollback transaction
   */
  async rollbackTransaction(): Promise<void> {
    if (this.transactionDepth > 0) {
      await this.prisma.$executeRawUnsafe('ROLLBACK')
      this.transactionDepth--
    }
  }

  /**
   * Commit transaction
   */
  async commitTransaction(): Promise<void> {
    if (this.transactionDepth > 0) {
      await this.prisma.$executeRawUnsafe('COMMIT')
      this.transactionDepth--
    }
  }

  /**
   * Run test in transaction (auto-rollback)
   */
  async runInTransaction<T>(
    fn: (prisma: PrismaClient) => Promise<T>
  ): Promise<T> {
    await this.beginTransaction()
    try {
      const result = await fn(this.prisma)
      return result
    } finally {
      await this.rollbackTransaction()
    }
  }

  /**
   * Wait for database changes
   */
  async waitForChange(
    query: () => Promise<any>,
    predicate: (result: any) => boolean,
    options: { timeout?: number; interval?: number } = {}
  ): Promise<any> {
    const { timeout = 5000, interval = 100 } = options
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const result = await query()
      if (predicate(result)) {
        return result
      }
      await new Promise(resolve => setTimeout(resolve, interval))
    }

    throw new Error('Timeout waiting for database change')
  }

  /**
   * Get test metrics
   */
  async getMetrics(): Promise<{
    users: number
    sessions: number
    accounts: number
    activeSessions: number
    verifiedUsers: number
  }> {
    const [users, sessions, accounts, activeSessions, verifiedUsers] = 
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.session.count(),
        this.prisma.account.count(),
        this.prisma.session.count({
          where: { expires: { gt: new Date() } }
        }),
        this.prisma.user.count({
          where: { emailVerified: { not: null } }
        })
      ])

    return {
      users,
      sessions,
      accounts,
      activeSessions,
      verifiedUsers
    }
  }
}

/**
 * Database test helpers
 */
export const testDb = TestDatabase.getInstance()

/**
 * Test database setup/teardown hooks
 */
export const dbHooks = {
  /**
   * Setup before all tests
   */
  async beforeAll(): Promise<void> {
    await testDb.connect()
    if (process.env.CLEAR_DB_BEFORE_TESTS === 'true') {
      await testDb.clear()
      await testDb.resetSequences()
    }
  },

  /**
   * Setup before each test
   */
  async beforeEach(): Promise<void> {
    if (process.env.USE_DB_TRANSACTIONS === 'true') {
      await testDb.beginTransaction()
    }
  },

  /**
   * Teardown after each test
   */
  async afterEach(): Promise<void> {
    if (process.env.USE_DB_TRANSACTIONS === 'true') {
      await testDb.rollbackTransaction()
    } else if (process.env.CLEAR_DB_AFTER_EACH === 'true') {
      await testDb.clear()
    }
  },

  /**
   * Teardown after all tests
   */
  async afterAll(): Promise<void> {
    if (process.env.CLEAR_DB_AFTER_TESTS === 'true') {
      await testDb.clear()
    }
    await testDb.disconnect()
  }
}

/**
 * Database assertion helpers
 */
export const dbAssert = {
  /**
   * Assert record exists
   */
  async exists(
    model: keyof PrismaClient,
    where: any
  ): Promise<void> {
    const client = testDb.getClient() as any
    const count = await client[model].count({ where })
    if (count === 0) {
      throw new Error(`Record not found in ${String(model)}`)
    }
  },

  /**
   * Assert record does not exist
   */
  async notExists(
    model: keyof PrismaClient,
    where: any
  ): Promise<void> {
    const client = testDb.getClient() as any
    const count = await client[model].count({ where })
    if (count > 0) {
      throw new Error(`Unexpected record found in ${String(model)}`)
    }
  },

  /**
   * Assert record count
   */
  async count(
    model: keyof PrismaClient,
    expected: number,
    where?: any
  ): Promise<void> {
    const client = testDb.getClient() as any
    const actual = await client[model].count({ where })
    if (actual !== expected) {
      throw new Error(
        `Expected ${expected} records in ${String(model)}, found ${actual}`
      )
    }
  },

  /**
   * Assert record field value
   */
  async field(
    model: keyof PrismaClient,
    where: any,
    field: string,
    expected: any
  ): Promise<void> {
    const client = testDb.getClient() as any
    const record = await client[model].findFirst({ where })
    if (!record) {
      throw new Error(`Record not found in ${String(model)}`)
    }
    if (record[field] !== expected) {
      throw new Error(
        `Expected ${field} to be ${expected}, got ${record[field]}`
      )
    }
  }
}