import { Session } from 'next-auth'
import { JWT } from 'next-auth/jwt'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { factories } from './mock-factory'
import { generate } from './test-utils'

/**
 * Test authentication utilities
 */
export class TestAuth {
  private readonly jwtSecret = process.env.NEXTAUTH_SECRET || 'test-secret'
  private readonly sessionCookieName = process.env.NODE_ENV === 'production' 
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token'

  /**
   * Create a valid session token
   */
  createSessionToken(payload: Partial<JWT> = {}): string {
    const token: JWT = {
      sub: generate.uuid(),
      email: generate.email(),
      name: 'Test User',
      picture: null,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
      ...payload
    }

    // Mock JWT token for testing
    return `mock_jwt_${Buffer.from(JSON.stringify(token)).toString('base64')}`
  }

  /**
   * Verify session token
   */
  verifySessionToken(token: string): JWT | null {
    try {
      // Mock JWT verification for testing
      if (!token.startsWith('mock_jwt_')) {
        return null
      }
      const base64 = token.replace('mock_jwt_', '')
      const decoded = JSON.parse(Buffer.from(base64, 'base64').toString())
      
      // Check expiration
      if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
        return null
      }
      
      return decoded as JWT
    } catch {
      return null
    }
  }

  /**
   * Create authenticated session
   */
  createSession(user?: Partial<Session['user']>): Session {
    const defaultUser = {
      id: generate.uuid(),
      email: generate.email(),
      name: 'Test User',
      image: null
    }

    return {
      user: { ...defaultUser, ...user },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }
  }

  /**
   * Mock authentication for tests
   */
  mockAuth(session?: Session | null): {
    getSession: jest.Mock
    getCsrfToken: jest.Mock
    signIn: jest.Mock
    signOut: jest.Mock
  } {
    return {
      getSession: jest.fn().mockResolvedValue(session),
      getCsrfToken: jest.fn().mockResolvedValue('mock-csrf-token'),
      signIn: jest.fn().mockResolvedValue({
        error: undefined,
        status: 200,
        ok: true,
        url: '/dashboard'
      }),
      signOut: jest.fn().mockResolvedValue({
        url: '/'
      })
    }
  }

  /**
   * Create test credentials
   */
  async createCredentials(password: string = 'Test123!'): Promise<{
    email: string
    password: string
    hashedPassword: string
  }> {
    const email = generate.email()
    const hashedPassword = await bcrypt.hash(password, 4)

    return {
      email,
      password,
      hashedPassword
    }
  }

  /**
   * Verify password
   */
  async verifyPassword(
    password: string,
    hashedPassword: string
  ): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword)
  }

  /**
   * Set authentication cookie
   */
  setAuthCookie(token: string): void {
    // This would be used in integration tests
    // In unit tests, mock the cookies module
    const cookieStore = {
      set: jest.fn()
    }
    
    cookieStore.set(this.sessionCookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    })
  }

  /**
   * Clear authentication cookie
   */
  clearAuthCookie(): void {
    const cookieStore = {
      delete: jest.fn()
    }
    
    cookieStore.delete(this.sessionCookieName)
  }

  /**
   * Create OAuth mock data
   */
  createOAuthData(provider: string = 'google'): {
    account: any
    profile: any
  } {
    const account = {
      provider,
      type: 'oauth',
      providerAccountId: generate.uuid(),
      access_token: `access_${generate.string()}`,
      token_type: 'Bearer',
      scope: 'email profile',
      expires_at: Math.floor(Date.now() / 1000) + 3600
    }

    const profile = {
      id: account.providerAccountId,
      email: generate.email(),
      name: 'OAuth User',
      picture: 'https://example.com/avatar.jpg',
      email_verified: true
    }

    return { account, profile }
  }

  /**
   * Mock NextAuth callbacks
   */
  mockCallbacks(): {
    signIn: jest.Mock
    redirect: jest.Mock
    session: jest.Mock
    jwt: jest.Mock
  } {
    return {
      signIn: jest.fn().mockResolvedValue(true),
      redirect: jest.fn(({ url }) => url),
      session: jest.fn(({ session, token }) => ({
        ...session,
        user: {
          ...session.user,
          id: token.sub
        }
      })),
      jwt: jest.fn(({ token, user }) => {
        if (user) {
          token.id = user.id
        }
        return token
      })
    }
  }

  /**
   * Create test authorization header
   */
  createAuthHeader(token?: string): { Authorization: string } {
    return {
      Authorization: `Bearer ${token || this.createSessionToken()}`
    }
  }

  /**
   * Mock protected route
   */
  mockProtectedRoute(
    isAuthenticated: boolean = true,
    user?: Session['user']
  ): {
    middleware: jest.Mock
    getServerSession: jest.Mock
  } {
    const session = isAuthenticated
      ? this.createSession(user)
      : null

    return {
      middleware: jest.fn((req, res, next) => {
        if (!isAuthenticated) {
          return res.status(401).json({ error: 'Unauthorized' })
        }
        req.session = session
        next()
      }),
      getServerSession: jest.fn().mockResolvedValue(session)
    }
  }

  /**
   * Create 2FA test data
   */
  create2FAData(): {
    secret: string
    token: string
    backupCodes: string[]
    qrCode: string
  } {
    return {
      secret: 'JBSWY3DPEHPK3PXP',
      token: '123456',
      backupCodes: Array.from({ length: 10 }, () => generate.string(8)),
      qrCode: 'data:image/png;base64,mock-qr-code'
    }
  }

  /**
   * Mock rate limiting
   */
  mockRateLimit(
    limit: number = 5,
    window: number = 60000
  ): {
    check: jest.Mock
    reset: jest.Mock
  } {
    const attempts = new Map<string, number[]>()

    return {
      check: jest.fn((identifier: string) => {
        const now = Date.now()
        const userAttempts = attempts.get(identifier) || []
        
        // Remove old attempts outside window
        const validAttempts = userAttempts.filter(
          time => now - time < window
        )
        
        if (validAttempts.length >= limit) {
          return {
            success: false,
            limit,
            remaining: 0,
            reset: new Date(validAttempts[0] + window)
          }
        }
        
        validAttempts.push(now)
        attempts.set(identifier, validAttempts)
        
        return {
          success: true,
          limit,
          remaining: limit - validAttempts.length,
          reset: new Date(now + window)
        }
      }),
      reset: jest.fn((identifier: string) => {
        attempts.delete(identifier)
      })
    }
  }
}

/**
 * Test auth instance
 */
export const testAuth = new TestAuth()

/**
 * Auth test scenarios
 */
export const authScenarios = {
  /**
   * Unauthenticated user
   */
  unauthenticated(): {
    session: null
    headers: {}
  } {
    return {
      session: null,
      headers: {}
    }
  },

  /**
   * Authenticated user
   */
  authenticated(userId?: string): {
    session: Session
    headers: { Authorization: string }
    token: string
  } {
    const session = testAuth.createSession({
      id: userId || generate.uuid()
    })
    const token = testAuth.createSessionToken({
      sub: session.user?.id
    })

    return {
      session,
      headers: testAuth.createAuthHeader(token),
      token
    }
  },

  /**
   * Admin user
   * TODO: When role-based access control is implemented:
   * 1. Add 'role' field to User model in schema.prisma
   * 2. Update JWT token to include actual user role from database
   * 3. Implement role checking middleware
   */
  admin(): {
    session: Session
    headers: { Authorization: string }
    token: string
  } {
    const session = testAuth.createSession({
      id: 'admin-id',
      email: 'admin@example.com',
      name: 'Admin User'
    })
    const token = testAuth.createSessionToken({
      sub: session.user?.id,
      role: 'ADMIN' // Mock role for testing - not enforced in production
    })

    return {
      session,
      headers: testAuth.createAuthHeader(token),
      token
    }
  },

  /**
   * User with expired session
   */
  expired(): {
    session: Session
    headers: { Authorization: string }
    token: string
  } {
    const session = testAuth.createSession()
    session.expires = new Date(Date.now() - 1000).toISOString()
    
    const token = testAuth.createSessionToken({
      exp: Math.floor(Date.now() / 1000) - 60
    })

    return {
      session,
      headers: testAuth.createAuthHeader(token),
      token
    }
  },

  /**
   * User with 2FA enabled
   */
  with2FA(): {
    session: Session
    headers: { Authorization: string }
    token: string
    twoFactorData: ReturnType<TestAuth['create2FAData']>
  } {
    const base = this.authenticated()
    const twoFactorData = testAuth.create2FAData()

    return {
      ...base,
      twoFactorData
    }
  }
}

/**
 * Auth assertion helpers
 */
export const authAssert = {
  /**
   * Assert user is authenticated
   */
  isAuthenticated(session: Session | null): asserts session is Session {
    if (!session) {
      throw new Error('Expected user to be authenticated')
    }
  },

  /**
   * Assert user is not authenticated
   */
  isNotAuthenticated(session: Session | null): asserts session is null {
    if (session) {
      throw new Error('Expected user to not be authenticated')
    }
  },

  /**
   * Assert session has user
   */
  hasUser(
    session: Session | null,
    userId?: string
  ): asserts session is Session {
    // Inline authentication check to satisfy TypeScript
    if (!session) {
      throw new Error('Expected user to be authenticated')
    }
    if (!session.user) {
      throw new Error('Session has no user')
    }
    if (userId && session.user.id !== userId) {
      throw new Error(`Expected user ${userId}, got ${session.user.id}`)
    }
  },

  /**
   * Assert token is valid
   */
  tokenValid(token: string): void {
    const decoded = testAuth.verifySessionToken(token)
    if (!decoded) {
      throw new Error('Invalid token')
    }
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Token expired')
    }
  },

  /**
   * Assert response requires auth
   */
  requiresAuth(response: { status: number }): void {
    if (response.status !== 401) {
      throw new Error(`Expected 401, got ${response.status}`)
    }
  },

  /**
   * Assert response is forbidden
   */
  isForbidden(response: { status: number }): void {
    if (response.status !== 403) {
      throw new Error(`Expected 403, got ${response.status}`)
    }
  }
}