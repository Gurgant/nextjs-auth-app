/**
 * Mock Prisma client for testing
 */

type MockPrismaClient = {
  user: any
  account: any
  session: any
  verificationToken: any
  $transaction: jest.Mock
  $connect: jest.Mock
  $disconnect: jest.Mock
  $executeRaw: jest.Mock
  $executeRawUnsafe: jest.Mock
  $queryRaw: jest.Mock
  $queryRawUnsafe: jest.Mock
}

export const mockPrismaClient: MockPrismaClient = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn()
  },
  account: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn()
  },
  session: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn()
  },
  verificationToken: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn()
  },
  $transaction: jest.fn((fn: any): any => {
    // Mock transaction by just executing the function
    if (typeof fn === 'function') {
      return fn(mockPrismaClient)
    }
    // For array of operations
    return Promise.all(fn)
  }),
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
  $executeRaw: jest.fn(),
  $executeRawUnsafe: jest.fn(),
  $queryRaw: jest.fn(),
  $queryRawUnsafe: jest.fn()
}

/**
 * Mock Prisma module
 */
export const mockPrisma = () => {
  jest.mock('@prisma/client', () => ({
    PrismaClient: jest.fn(() => mockPrismaClient),
    Prisma: {
      PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
        code: string
        meta?: any
        constructor(message: string, { code, meta }: { code: string; meta?: any }) {
          super(message)
          this.code = code
          this.meta = meta
        }
      }
    }
  }))
}

/**
 * Reset all Prisma mocks
 */
export const resetPrismaMocks = () => {
  Object.values(mockPrismaClient.user).forEach(mock => {
    if (typeof mock === 'function' && 'mockReset' in mock) {
      (mock as jest.Mock).mockReset()
    }
  })
  Object.values(mockPrismaClient.account).forEach(mock => {
    if (typeof mock === 'function' && 'mockReset' in mock) {
      (mock as jest.Mock).mockReset()
    }
  })
  Object.values(mockPrismaClient.session).forEach(mock => {
    if (typeof mock === 'function' && 'mockReset' in mock) {
      (mock as jest.Mock).mockReset()
    }
  })
  Object.values(mockPrismaClient.verificationToken).forEach(mock => {
    if (typeof mock === 'function' && 'mockReset' in mock) {
      (mock as jest.Mock).mockReset()
    }
  })
}

/**
 * Helper to setup common mock responses
 */
export const setupPrismaMocks = {
  user: {
    findByEmail: (email: string, userData: any) => {
      mockPrismaClient.user.findUnique.mockImplementation((args: any) => {
        if (args.where?.email === email) {
          return Promise.resolve(userData)
        }
        return Promise.resolve(null)
      })
    },
    
    findById: (id: string, userData: any) => {
      mockPrismaClient.user.findUnique.mockImplementation((args: any) => {
        if (args.where?.id === id) {
          return Promise.resolve(userData)
        }
        return Promise.resolve(null)
      })
    },
    
    create: (userData: any) => {
      mockPrismaClient.user.create.mockResolvedValue(userData)
    },
    
    notFound: () => {
      mockPrismaClient.user.findUnique.mockResolvedValue(null)
      mockPrismaClient.user.findFirst.mockResolvedValue(null)
    }
  },
  
  account: {
    findByUserId: (userId: string, accountData: any) => {
      mockPrismaClient.account.findMany.mockImplementation((args: any) => {
        if (args.where?.userId === userId) {
          return Promise.resolve(Array.isArray(accountData) ? accountData : [accountData])
        }
        return Promise.resolve([])
      })
    },
    
    create: (accountData: any) => {
      mockPrismaClient.account.create.mockResolvedValue(accountData)
    }
  },
  
  session: {
    findValid: (sessionData: any) => {
      mockPrismaClient.session.findFirst.mockImplementation((args: any) => {
        if (args.where?.expires?.gt) {
          return Promise.resolve(sessionData)
        }
        return Promise.resolve(null)
      })
    },
    
    create: (sessionData: any) => {
      mockPrismaClient.session.create.mockResolvedValue(sessionData)
    },
    
    deleteExpired: (count: number) => {
      mockPrismaClient.session.deleteMany.mockResolvedValue({ count })
    }
  }
}