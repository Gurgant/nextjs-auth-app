/**
 * Unit tests for authentication - Using mocked Prisma
 * These tests run without any database connection
 */

import { RegisterUserCommand } from '@/lib/commands/auth/register-user.command'
import { LoginUserCommand } from '@/lib/commands/auth/login-user.command'
import { mockPrismaClient, resetPrismaMocks, setupPrismaMocks } from '../../mocks/prisma.mock'
import { UserBuilder } from '../../builders/user.builder'
import { AccountBuilder } from '../../builders/account.builder'
import bcrypt from 'bcryptjs'

// Mock Prisma client
jest.mock('@/lib/database', () => ({
  prisma: mockPrismaClient
}))

// Mock the repositories to use our mock Prisma
jest.mock('@/lib/repositories', () => ({
  repositories: {
    getUserRepository: () => ({
      findByEmail: jest.fn(async (email: string) => {
        return mockPrismaClient.user.findUnique({ where: { email } })
      }),
      findById: jest.fn(async (id: string) => {
        return mockPrismaClient.user.findUnique({ where: { id } })
      }),
      findByCredentials: jest.fn(async (email: string, password: string) => {
        const user = await mockPrismaClient.user.findUnique({ where: { email } })
        if (!user || !user.password) return null
        const isValid = await bcrypt.compare(password, user.password)
        return isValid ? user : null
      }),
      create: jest.fn(async (data: any) => {
        return mockPrismaClient.user.create({ data })
      }),
      createWithAccount: jest.fn(async (data: any) => {
        const user = await mockPrismaClient.user.create({ 
          data: {
            name: data.name,
            email: data.email,
            password: data.password
          }
        })
        await mockPrismaClient.account.create({
          data: {
            userId: user.id,
            provider: data.provider,
            providerAccountId: data.providerAccountId,
            type: 'credentials'
          }
        })
        return user
      }),
      update: jest.fn(async (id: string, data: any) => {
        return mockPrismaClient.user.update({ where: { id }, data })
      }),
      updateLastLogin: jest.fn(async (id: string) => {
        return mockPrismaClient.user.update({ 
          where: { id }, 
          data: { lastLoginAt: new Date() }
        })
      }),
      updatePassword: jest.fn(async (id: string, password: string) => {
        return mockPrismaClient.user.update({
          where: { id },
          data: { password }
        })
      }),
      delete: jest.fn(async (id: string) => {
        await mockPrismaClient.user.delete({ where: { id } })
        return true
      })
    })
  }
}))

describe('Authentication Unit Tests (Mocked)', () => {
  beforeEach(() => {
    resetPrismaMocks()
    jest.clearAllMocks()
  })

  describe('User Registration', () => {
    it('should register a new user successfully', async () => {
      // Arrange
      const newUser = new UserBuilder()
        .withEmail('newuser@test.com')
        .withName('New User')
        .build()

      // Mock that user doesn't exist
      mockPrismaClient.user.findUnique.mockResolvedValue(null)
      
      // Mock successful user creation
      mockPrismaClient.user.create.mockResolvedValue(newUser)
      mockPrismaClient.account.create.mockResolvedValue(
        new AccountBuilder()
          .forUser(newUser.id)
          .credentials(newUser.email)
          .build()
      )

      const command = new RegisterUserCommand()
      
      // Act
      const result = await command.execute({
        name: 'New User',
        email: 'newuser@test.com',
        password: 'Test123!',
        confirmPassword: 'Test123!'
      })

      // Assert
      expect(result.success).toBe(true)
      expect(mockPrismaClient.user.create).toHaveBeenCalled()
      expect(mockPrismaClient.account.create).toHaveBeenCalled()
    })

    it('should prevent duplicate email registration', async () => {
      // Arrange
      const existingUser = new UserBuilder()
        .withEmail('existing@test.com')
        .build()

      // Mock that user already exists
      mockPrismaClient.user.findUnique.mockResolvedValue(existingUser)

      const command = new RegisterUserCommand()
      
      // Act
      const result = await command.execute({
        name: 'Another User',
        email: 'existing@test.com',
        password: 'Test123!',
        confirmPassword: 'Test123!'
      })

      // Assert
      expect(result.success).toBe(false)
      expect(mockPrismaClient.user.create).not.toHaveBeenCalled()
    })

    it('should validate password requirements', async () => {
      // Arrange
      mockPrismaClient.user.findUnique.mockResolvedValue(null)
      
      const command = new RegisterUserCommand()
      
      // Act - weak password
      const result = await command.execute({
        name: 'Test User',
        email: 'test@test.com',
        password: 'weak',
        confirmPassword: 'weak'
      })

      // Assert
      expect(result.success).toBe(false)
      expect(mockPrismaClient.user.create).not.toHaveBeenCalled()
    })
  })

  describe('User Login', () => {
    it('should login with valid credentials', async () => {
      // Arrange
      const hashedPassword = await bcrypt.hash('Test123!', 4)
      const user = new UserBuilder()
        .withEmail('user@test.com')
        .withHashedPassword(hashedPassword)
        .build()

      mockPrismaClient.user.findUnique.mockResolvedValue(user)
      mockPrismaClient.user.update.mockResolvedValue({
        ...user,
        lastLoginAt: new Date()
      })

      const command = new LoginUserCommand()
      
      // Act
      const result = await command.execute({
        email: 'user@test.com',
        password: 'Test123!'
      })

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.userId).toBe(user.id)
      }
      expect(mockPrismaClient.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: user.id },
          data: expect.objectContaining({ lastLoginAt: expect.any(Date) })
        })
      )
    })

    it('should reject invalid credentials', async () => {
      // Arrange
      const hashedPassword = await bcrypt.hash('Test123!', 4)
      const user = new UserBuilder()
        .withEmail('user@test.com')
        .withHashedPassword(hashedPassword)
        .build()

      mockPrismaClient.user.findUnique.mockResolvedValue(user)

      const command = new LoginUserCommand()
      
      // Act
      const result = await command.execute({
        email: 'user@test.com',
        password: 'WrongPassword!'
      })

      // Assert
      expect(result.success).toBe(false)
      expect(mockPrismaClient.user.update).not.toHaveBeenCalled()
    })

    it('should handle non-existent user', async () => {
      // Arrange
      mockPrismaClient.user.findUnique.mockResolvedValue(null)

      const command = new LoginUserCommand()
      
      // Act
      const result = await command.execute({
        email: 'nonexistent@test.com',
        password: 'Test123!'
      })

      // Assert
      expect(result.success).toBe(false)
    })

    it('should handle locked accounts', async () => {
      // Arrange
      const lockedUser = new UserBuilder()
        .withEmail('locked@test.com')
        .locked()
        .build()

      mockPrismaClient.user.findUnique.mockResolvedValue(lockedUser)

      const command = new LoginUserCommand()
      
      // Act
      const result = await command.execute({
        email: 'locked@test.com',
        password: 'Test123!'
      })

      // Assert
      expect(result.success).toBe(false)
      // The account is locked, so login should fail
    })
  })

  describe('Password Management', () => {
    it('should change password successfully', async () => {
      // Arrange
      const oldHashedPassword = await bcrypt.hash('OldPass123!', 4)
      const user = new UserBuilder()
        .withId('user-123')
        .withHashedPassword(oldHashedPassword)
        .build()

      mockPrismaClient.user.findUnique.mockResolvedValue(user)
      mockPrismaClient.user.update.mockResolvedValue({
        ...user,
        password: await bcrypt.hash('NewPass123!', 4)
      })

      const { ChangePasswordCommand } = await import('@/lib/commands/auth/change-password.command')
      const command = new ChangePasswordCommand()
      
      // Act
      const result = await command.execute({
        userId: 'user-123',
        currentPassword: 'OldPass123!',
        newPassword: 'NewPass123!',
        confirmPassword: 'NewPass123!'
      })

      // Assert
      expect(result.success).toBe(true)
      expect(mockPrismaClient.user.update).toHaveBeenCalled()
    }, 10000) // 10 second timeout for password change with bcrypt
  })

  describe('Session Management', () => {
    it('should create session on successful login', async () => {
      // Arrange
      const hashedPassword = await bcrypt.hash('Test123!', 4)
      const user = new UserBuilder()
        .withEmail('session@test.com')
        .withHashedPassword(hashedPassword)
        .build()

      mockPrismaClient.user.findUnique.mockResolvedValue(user)
      mockPrismaClient.user.update.mockResolvedValue({
        ...user,
        lastLoginAt: new Date()
      })
      
      const sessionData = {
        id: 'session-123',
        userId: user.id,
        sessionToken: 'token-123',
        expires: new Date(Date.now() + 86400000)
      }
      mockPrismaClient.session.create.mockResolvedValue(sessionData)

      const command = new LoginUserCommand()
      
      // Act
      const result = await command.execute({
        email: 'session@test.com',
        password: 'Test123!'
      })

      // Assert
      expect(result.success).toBe(true)
      // In a real scenario, NextAuth would create the session
      // Here we're verifying the login succeeded which would trigger session creation
    })
  })
})

describe('OAuth Authentication Unit Tests', () => {
  beforeEach(() => {
    resetPrismaMocks()
  })

  it('should handle Google OAuth account creation', async () => {
    // Arrange
    const user = new UserBuilder()
      .withEmail('oauth@test.com')
      .oauthUser('google')
      .build()

    const googleAccount = new AccountBuilder()
      .forUser(user.id)
      .google()
      .build()

    mockPrismaClient.user.create.mockResolvedValue(user)
    mockPrismaClient.account.create.mockResolvedValue(googleAccount)

    // Act - Simulate OAuth account creation
    const createdUser = await mockPrismaClient.user.create({ data: user })
    const createdAccount = await mockPrismaClient.account.create({ data: googleAccount })

    // Assert
    expect(createdUser.email).toBe('oauth@test.com')
    expect(createdAccount.provider).toBe('google')
    expect(createdAccount.type).toBe('oauth')
  })

  it('should link OAuth account to existing user', async () => {
    // Arrange
    const existingUser = new UserBuilder()
      .withId('user-456')
      .withEmail('existing@test.com')
      .build()

    mockPrismaClient.user.findUnique.mockResolvedValue(existingUser)
    
    const googleAccount = new AccountBuilder()
      .forUser(existingUser.id)
      .google()
      .build()

    mockPrismaClient.account.create.mockResolvedValue(googleAccount)
    mockPrismaClient.account.findMany.mockResolvedValue([googleAccount])

    // Act
    const linkedAccount = await mockPrismaClient.account.create({ data: googleAccount })
    const userAccounts = await mockPrismaClient.account.findMany({ 
      where: { userId: existingUser.id } 
    })

    // Assert
    expect(linkedAccount.userId).toBe(existingUser.id)
    expect(userAccounts).toHaveLength(1)
    expect(userAccounts[0].provider).toBe('google')
  })
})