import { Account } from '@/lib/types/prisma'
import { ChainableBuilder } from './base.builder'
import { generate } from '../utils/test-utils'

/**
 * Account builder for test data
 */
export class AccountBuilder extends ChainableBuilder<Account, AccountBuilder> {
  private sequence = 0

  protected getDefaults(): Account {
    this.sequence++
    return {
      id: generate.uuid(),
      userId: generate.uuid(),
      type: 'oauth',
      provider: 'google',
      providerAccountId: `provider_account_${this.sequence}_${generate.string(10)}`,
      refresh_token: null,
      access_token: null,
      expires_at: null,
      token_type: null,
      scope: null,
      id_token: null,
      session_state: null
    }
  }

  protected doBuild(): Account {
    return {
      ...this.getDefaults(),
      ...this.data
    } as Account
  }

  /**
   * Set account ID
   */
  withId(id: string): this {
    return this.with('id', id)
  }

  /**
   * Set user ID
   */
  forUser(userId: string): this {
    return this.with('userId', userId)
  }

  /**
   * Set provider
   */
  withProvider(provider: string): this {
    return this.with('provider', provider)
  }

  /**
   * Set provider account ID
   */
  withProviderAccountId(id: string): this {
    return this.with('providerAccountId', id)
  }

  /**
   * Set account type
   */
  ofType(type: 'oauth' | 'credentials'): this {
    return this.with('type', type)
  }

  /**
   * Add OAuth tokens
   */
  withOAuthTokens(tokens: {
    accessToken: string
    refreshToken?: string
    expiresAt?: number
    tokenType?: string
    scope?: string
    idToken?: string
  }): this {
    return this
      .with('access_token', tokens.accessToken)
      .with('refresh_token', tokens.refreshToken || null)
      .with('expires_at', tokens.expiresAt || Math.floor(Date.now() / 1000) + 3600)
      .with('token_type', tokens.tokenType || 'Bearer')
      .with('scope', tokens.scope || 'email profile')
      .with('id_token', tokens.idToken || null)
  }

  /**
   * Create Google OAuth account
   */
  google(): this {
    return this
      .withProvider('google')
      .ofType('oauth')
      .withOAuthTokens({
        accessToken: `google_access_${generate.string(20)}`,
        refreshToken: `google_refresh_${generate.string(20)}`,
        tokenType: 'Bearer',
        scope: 'email profile openid',
        idToken: `google_id_${generate.string(40)}`
      })
      .with('providerAccountId', `google_${generate.string(15)}`)
  }

  /**
   * Create GitHub OAuth account
   */
  github(): this {
    return this
      .withProvider('github')
      .ofType('oauth')
      .withOAuthTokens({
        accessToken: `gho_${generate.string(36)}`,
        tokenType: 'Bearer',
        scope: 'read:user user:email'
      })
      .with('providerAccountId', generate.number(1000000, 9999999).toString())
  }

  /**
   * Create credentials account
   */
  credentials(email: string): this {
    return this
      .withProvider('credentials')
      .ofType('credentials')
      .withProviderAccountId(email)
      .with('refresh_token', null)
      .with('access_token', null)
      .with('expires_at', null)
      .with('token_type', null)
      .with('scope', null)
      .with('id_token', null)
  }

  /**
   * Create expired OAuth account
   */
  expiredOAuth(): this {
    const expiredTime = Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
    return this
      .ofType('oauth')
      .with('expires_at', expiredTime)
      .with('access_token', `expired_${generate.string(20)}`)
  }

  /**
   * Create account with valid tokens
   */
  withValidTokens(): this {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
    return this
      .with('access_token', `valid_access_${generate.string(30)}`)
      .with('refresh_token', `valid_refresh_${generate.string(30)}`)
      .with('expires_at', expiresAt)
      .with('token_type', 'Bearer')
  }

  /**
   * Create account without refresh token
   */
  withoutRefreshToken(): this {
    return this
      .with('refresh_token', null)
      .with('access_token', `access_only_${generate.string(30)}`)
  }

  /**
   * Create linked account (for multi-provider)
   */
  linked(userId: string, provider: string): this {
    return this
      .forUser(userId)
      .withProvider(provider)
      .withValidTokens()
  }
}

/**
 * Account builder factory for creating multiple related accounts
 */
export class AccountBuilderFactory {
  private accounts: AccountBuilder[] = []

  /**
   * Create new account builder
   */
  create(): AccountBuilder {
    const builder = new AccountBuilder()
    this.accounts.push(builder)
    return builder
  }

  /**
   * Create multiple account builders
   */
  createMany(count: number): AccountBuilder[] {
    return Array.from({ length: count }, () => this.create())
  }

  /**
   * Create all provider accounts for a user
   */
  createAllProviders(userId: string): {
    google: AccountBuilder
    github: AccountBuilder
    credentials: AccountBuilder
  } {
    return {
      google: this.create().forUser(userId).google(),
      github: this.create().forUser(userId).github(),
      credentials: this.create().forUser(userId).credentials(`user_${userId}@example.com`)
    }
  }

  /**
   * Create multiple OAuth accounts for a user
   */
  createMultipleOAuth(userId: string, providers: string[]): AccountBuilder[] {
    return providers.map(provider => {
      const builder = this.create().forUser(userId).withProvider(provider)
      
      switch (provider) {
        case 'google':
          return builder.google()
        case 'github':
          return builder.github()
        default:
          return builder.ofType('oauth').withValidTokens()
      }
    })
  }

  /**
   * Build all accounts
   */
  buildAll(): Account[] {
    return this.accounts.map(builder => builder.build())
  }

  /**
   * Reset factory
   */
  reset(): void {
    this.accounts = []
  }
}

/**
 * Pre-configured account builders
 */
export const accountBuilders = {
  /**
   * Google OAuth account
   */
  google: (userId?: string) => {
    const builder = new AccountBuilder().google()
    return userId ? builder.forUser(userId) : builder
  },

  /**
   * GitHub OAuth account
   */
  github: (userId?: string) => {
    const builder = new AccountBuilder().github()
    return userId ? builder.forUser(userId) : builder
  },

  /**
   * Credentials account
   */
  credentials: (userId: string, email: string) => {
    return new AccountBuilder()
      .forUser(userId)
      .credentials(email)
  },

  /**
   * Expired OAuth account
   */
  expiredOAuth: (userId?: string) => {
    const builder = new AccountBuilder().expiredOAuth()
    return userId ? builder.forUser(userId) : builder
  },

  /**
   * Valid OAuth account
   */
  validOAuth: (provider = 'google', userId?: string) => {
    const builder = new AccountBuilder()
      .withProvider(provider)
      .ofType('oauth')
      .withValidTokens()
    return userId ? builder.forUser(userId) : builder
  },

  /**
   * Linked account
   */
  linked: (userId: string, provider: string) => {
    return new AccountBuilder().linked(userId, provider)
  }
}

/**
 * Account test scenarios
 */
export class AccountScenarios {
  /**
   * User with single OAuth provider
   */
  static singleOAuth(userId: string, provider = 'google'): Account {
    // Handle different builder signatures
    if (provider === 'credentials') {
      return accountBuilders.credentials(userId, `${userId}@example.com`).build()
    }
    const builder = provider === 'github' ? accountBuilders.github : accountBuilders.google
    return builder(userId).build()
  }

  /**
   * User with multiple OAuth providers
   */
  static multipleOAuth(userId: string): Account[] {
    return [
      accountBuilders.google(userId).build(),
      accountBuilders.github(userId).build()
    ]
  }

  /**
   * User with credentials and OAuth
   */
  static hybrid(userId: string, email: string): Account[] {
    return [
      accountBuilders.credentials(userId, email).build(),
      accountBuilders.google(userId).build()
    ]
  }

  /**
   * User with expired OAuth tokens
   */
  static expiredTokens(userId: string): Account {
    return accountBuilders.expiredOAuth(userId).build()
  }

  /**
   * User switching from credentials to OAuth
   */
  static migration(userId: string, email: string): {
    before: Account
    after: Account
  } {
    return {
      before: accountBuilders.credentials(userId, email).build(),
      after: accountBuilders.google(userId).build()
    }
  }
}