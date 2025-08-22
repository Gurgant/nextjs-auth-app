import { User, Account, Session } from '@/lib/types/prisma'
import { Session as NextAuthSession } from 'next-auth'
import { generate } from './test-utils'

/**
 * Base factory class for creating test data
 */
export abstract class Factory<T> {
  protected defaults: Partial<T> = {}
  protected sequence: number = 0

  /**
   * Set default values for all instances
   */
  setDefaults(defaults: Partial<T>): this {
    this.defaults = { ...this.defaults, ...defaults }
    return this
  }

  /**
   * Build a single instance
   */
  abstract build(overrides?: Partial<T>): T

  /**
   * Build multiple instances
   */
  buildMany(count: number, overrides?: Partial<T>): T[] {
    return Array.from({ length: count }, () => this.build(overrides))
  }

  /**
   * Get next sequence number
   */
  protected nextSequence(): number {
    return ++this.sequence
  }

  /**
   * Reset sequence counter
   */
  resetSequence(): void {
    this.sequence = 0
  }
}

/**
 * User factory
 */
export class UserFactory extends Factory<User> {
  build(overrides?: Partial<User>): User {
    const seq = this.nextSequence()
    const id = overrides?.id || generate.uuid()

    return {
      id,
      name: `Test User ${seq}`,
      email: `user${seq}@test.com`,
      emailVerified: new Date(),
      password: '$2a$10$hashed_password_here',
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: new Date(),
      hasEmailAccount: true,
      hasGoogleAccount: false,
      primaryAuthMethod: 'email',
      passwordSetAt: new Date(),
      lastPasswordChange: new Date(),
      requiresPasswordChange: false,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      backupCodes: [],
      loginAttempts: 0,
      lockedUntil: null,
      lastLoginIp: null,
      emailVerificationRequired: true,
      twoFactorEnabledAt: null,
      role: 'USER' as const,
      ...this.defaults,
      ...overrides
    }
  }

  /**
   * Create a user with OAuth account
   */
  withOAuth(provider: string = 'google'): User {
    return this.build({
      hasGoogleAccount: provider === 'google',
      hasEmailAccount: false,
      primaryAuthMethod: provider,
      password: null,
      passwordSetAt: null,
      lastPasswordChange: null
    })
  }

  /**
   * Create a user with 2FA enabled
   */
  with2FA(): User {
    return this.build({
      twoFactorEnabled: true,
      twoFactorSecret: 'SECRET123',
      backupCodes: ['CODE1', 'CODE2', 'CODE3'],
      twoFactorEnabledAt: new Date()
    })
  }

  /**
   * Create a locked user
   */
  locked(until?: Date): User {
    return this.build({
      lockedUntil: until || new Date(Date.now() + 3600000),
      loginAttempts: 5
    })
  }

  /**
   * Create an unverified user
   */
  unverified(): User {
    return this.build({
      emailVerified: null
    })
  }
}

/**
 * Account factory
 */
export class AccountFactory extends Factory<Account> {
  build(overrides?: Partial<Account>): Account {
    const seq = this.nextSequence()

    return {
      id: generate.uuid(),
      userId: generate.uuid(),
      type: 'oauth',
      provider: 'google',
      providerAccountId: `provider_${seq}`,
      refresh_token: `refresh_token_${seq}`,
      access_token: `access_token_${seq}`,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'Bearer',
      scope: 'email profile',
      id_token: `id_token_${seq}`,
      session_state: null,
      ...this.defaults,
      ...overrides
    }
  }

  /**
   * Create Google account
   */
  google(userId: string): Account {
    return this.build({
      userId,
      provider: 'google',
      type: 'oauth'
    })
  }

  /**
   * Create credentials account
   */
  credentials(userId: string, email: string): Account {
    return this.build({
      userId,
      provider: 'credentials',
      providerAccountId: email,
      type: 'credentials',
      refresh_token: null,
      access_token: null,
      expires_at: null,
      token_type: null,
      scope: null,
      id_token: null
    })
  }
}

/**
 * Session factory
 */
export class SessionFactory extends Factory<Session> {
  build(overrides?: Partial<Session>): Session {
    const seq = this.nextSequence()
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

    return {
      id: generate.uuid(),
      sessionToken: `session_token_${seq}`,
      userId: generate.uuid(),
      expires,
      ...this.defaults,
      ...overrides
    }
  }

  /**
   * Create expired session
   */
  expired(userId?: string): Session {
    return this.build({
      userId: userId || generate.uuid(),
      expires: new Date(Date.now() - 1000)
    })
  }

  /**
   * Create valid session
   */
  valid(userId: string): Session {
    return this.build({
      userId,
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    })
  }
}

/**
 * NextAuth Session factory
 */
export class NextAuthSessionFactory extends Factory<NextAuthSession> {
  build(overrides?: Partial<NextAuthSession>): NextAuthSession {
    const user = new UserFactory().build()

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image
      },
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      ...this.defaults,
      ...overrides
    }
  }

  /**
   * Create authenticated session with specific user
   */
  withUser(user: Partial<User>): NextAuthSession {
    return this.build({
      user: {
        id: user.id || generate.uuid(),
        email: user.email || generate.email(),
        name: user.name || 'Test User',
        image: user.image || null
      }
    })
  }

  /**
   * Create admin session
   */
  admin(): NextAuthSession {
    return this.build({
      user: {
        id: 'admin-id',
        email: 'admin@test.com',
        name: 'Admin User',
        image: null
      }
    })
  }
}

/**
 * Mock response factory
 */
export class ResponseFactory<T = any> {
  /**
   * Create success response
   */
  success(data?: T, message?: string): { success: true; data?: T; message?: string } {
    return {
      success: true,
      ...(data && { data }),
      ...(message && { message })
    }
  }

  /**
   * Create error response
   */
  error(
    message: string,
    errors?: Record<string, string | string[]>
  ): { success: false; error: string; errors?: Record<string, string | string[]> } {
    return {
      success: false,
      error: message,
      ...(errors && { errors })
    }
  }

  /**
   * Create validation error response
   */
  validationError(
    errors: Record<string, string | string[]>
  ): { success: false; error: string; errors: Record<string, string | string[]> } {
    return {
      success: false,
      error: 'Validation failed',
      errors
    }
  }

  /**
   * Create paginated response
   */
  paginated<T>(
    items: T[],
    total: number,
    page: number = 1,
    pageSize: number = 10
  ): {
    success: true
    data: T[]
    pagination: {
      total: number
      page: number
      pageSize: number
      totalPages: number
    }
  } {
    return {
      success: true,
      data: items,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    }
  }
}

/**
 * Request factory for testing API endpoints
 */
export class RequestFactory {
  private baseHeaders: HeadersInit = {
    'Content-Type': 'application/json'
  }

  /**
   * Set base headers
   */
  setHeaders(headers: HeadersInit): this {
    this.baseHeaders = { ...this.baseHeaders, ...headers }
    return this
  }

  /**
   * Create GET request
   */
  get(url: string, params?: Record<string, any>): Request {
    const queryString = params ? '?' + new URLSearchParams(params).toString() : ''
    return new Request(url + queryString, {
      method: 'GET',
      headers: this.baseHeaders
    })
  }

  /**
   * Create POST request
   */
  post(url: string, body?: any): Request {
    return new Request(url, {
      method: 'POST',
      headers: this.baseHeaders,
      body: body ? JSON.stringify(body) : undefined
    })
  }

  /**
   * Create PUT request
   */
  put(url: string, body?: any): Request {
    return new Request(url, {
      method: 'PUT',
      headers: this.baseHeaders,
      body: body ? JSON.stringify(body) : undefined
    })
  }

  /**
   * Create DELETE request
   */
  delete(url: string): Request {
    return new Request(url, {
      method: 'DELETE',
      headers: this.baseHeaders
    })
  }

  /**
   * Create authenticated request
   */
  authenticated(token: string): RequestFactory {
    this.setHeaders({
      Authorization: `Bearer ${token}`
    })
    return this
  }

  /**
   * Create request with cookies
   */
  withCookies(cookies: Record<string, string>): RequestFactory {
    const cookieString = Object.entries(cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ')
    
    this.setHeaders({
      Cookie: cookieString
    })
    return this
  }
}

/**
 * Factory instances for easy access
 */
export const factories = {
  user: new UserFactory(),
  account: new AccountFactory(),
  session: new SessionFactory(),
  nextAuthSession: new NextAuthSessionFactory(),
  response: new ResponseFactory(),
  request: new RequestFactory()
}

/**
 * Reset all factory sequences
 */
export function resetFactories(): void {
  Object.values(factories).forEach(factory => {
    if (factory instanceof Factory) {
      factory.resetSequence()
    }
  })
}