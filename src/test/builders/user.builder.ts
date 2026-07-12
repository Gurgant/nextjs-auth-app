import { User } from "@/lib/types/prisma";
import bcrypt from "bcryptjs";
import { ChainableBuilder } from "./base.builder";
import { generate } from "../utils/test-utils";

/**
 * User builder for test data
 */
export class UserBuilder extends ChainableBuilder<User, UserBuilder> {
  private sequence = 0;

  protected getDefaults(): User {
    this.sequence++;
    return {
      id: generate.uuid(),
      name: `Test User ${this.sequence}`,
      email: `user${this.sequence}@test.com`,
      emailVerified: new Date(),
      password: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: new Date(),
      lastLoginIp: null,
      hasEmailAccount: false,
      hasGoogleAccount: false,
      primaryAuthMethod: "email",
      passwordSetAt: null,
      lastPasswordChange: null,
      requiresPasswordChange: false,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorEnabledAt: null,
      backupCodes: [],
      loginAttempts: 0,
      lockedUntil: null,
      emailVerificationRequired: true,
      role: "USER" as const,
    };
  }

  protected doBuild(): User {
    return {
      ...this.getDefaults(),
      ...this.data,
    } as User;
  }

  /**
   * Set user ID
   */
  withId(id: string): this {
    return this.with("id", id);
  }

  /**
   * Set user name
   */
  withName(name: string): this {
    return this.with("name", name);
  }

  /**
   * Set user email
   */
  withEmail(email: string): this {
    return this.with("email", email);
  }

  /**
   * Set password (will be hashed)
   */
  async withPassword(password: string): Promise<this> {
    const hashedPassword = await bcrypt.hash(password, 4);
    return this.with("password", hashedPassword)
      .with("hasEmailAccount", true)
      .with("passwordSetAt", new Date())
      .with("lastPasswordChange", new Date());
  }

  /**
   * Set raw hashed password
   */
  withHashedPassword(hashedPassword: string): this {
    return this.with("password", hashedPassword)
      .with("hasEmailAccount", true)
      .with("passwordSetAt", new Date())
      .with("lastPasswordChange", new Date());
  }

  /**
   * Make user unverified
   */
  unverified(): this {
    return this.with("emailVerified", null);
  }

  /**
   * Make user verified
   */
  verified(date?: Date): this {
    return this.with("emailVerified", date || new Date());
  }

  /**
   * Make user inactive (no-op - field doesn't exist)
   * @deprecated Field no longer exists in schema
   */
  inactive(): this {
    // No-op: isActive field doesn't exist in schema
    return this;
  }

  /**
   * Make user active (no-op - field doesn't exist)
   * @deprecated Field no longer exists in schema
   */
  active(): this {
    // No-op: isActive field doesn't exist in schema
    return this;
  }

  /**
   * Add Google account
   */
  withGoogleAccount(): this {
    return this.with("hasGoogleAccount", true).with(
      "primaryAuthMethod",
      "google",
    );
  }

  /**
   * Add email account
   */
  withEmailAccount(): this {
    return this.with("hasEmailAccount", true).with(
      "primaryAuthMethod",
      "email",
    );
  }

  /**
   * Enable 2FA
   */
  with2FA(secret?: string): this {
    return this.with("twoFactorEnabled", true)
      .with("twoFactorSecret", secret || "SECRET123")
      .with("backupCodes", [
        "BACKUP1",
        "BACKUP2",
        "BACKUP3",
        "BACKUP4",
        "BACKUP5",
        "BACKUP6",
        "BACKUP7",
        "BACKUP8",
        "BACKUP9",
        "BACKUP10",
      ])
      .with("twoFactorEnabledAt", new Date());
  }

  /**
   * Disable 2FA
   */
  without2FA(): this {
    return this.with("twoFactorEnabled", false)
      .with("twoFactorSecret", null)
      .with("backupCodes", [])
      .with("twoFactorEnabledAt", null);
  }

  /**
   * Lock account
   */
  locked(until?: Date, attempts?: number): this {
    return this.with(
      "lockedUntil",
      until || new Date(Date.now() + 3600000),
    ).with("loginAttempts", attempts || 5);
  }

  /**
   * Unlock account
   */
  unlocked(): this {
    return this.with("lockedUntil", null).with("loginAttempts", 0);
  }

  /**
   * Require password change
   */
  requiresPasswordChange(): this {
    return this.with("requiresPasswordChange", true);
  }

  /**
   * Set last login
   */
  withLastLogin(date?: Date, ip?: string): this {
    return this.with("lastLoginAt", date || new Date()).with(
      "lastLoginIp",
      ip || "127.0.0.1",
    );
  }

  /**
   * Set profile image
   */
  withImage(url: string): this {
    return this.with("image", url);
  }

  /**
   * Set user role
   */
  withRole(role: "USER" | "PRO_USER" | "ADMIN"): this {
    return this.with("role", role);
  }

  /**
   * Create admin user
   */
  admin(): this {
    return this.withName("Admin User")
      .withEmail("admin@example.com")
      .withRole("ADMIN")
      .verified()
      .active();
  }

  /**
   * Create test user with common setup
   */
  testUser(index: number = 1): this {
    return this.withName(`Test User ${index}`)
      .withEmail(`test${index}@example.com`)
      .verified()
      .active();
  }

  /**
   * Create OAuth user
   */
  oauthUser(provider: string = "google"): this {
    return this.verified()
      .active()
      .with("hasGoogleAccount", provider === "google")
      .with("primaryAuthMethod", provider)
      .with("password", null);
  }

  /**
   * Create new user (just registered)
   */
  newUser(): this {
    return this.unverified()
      .active()
      .with("createdAt", new Date())
      .with("updatedAt", new Date())
      .with("lastLoginAt", null);
  }

  /**
   * Create old user (long-time member)
   */
  oldUser(years: number = 2): this {
    const createdAt = new Date();
    createdAt.setFullYear(createdAt.getFullYear() - years);

    return this.verified(createdAt)
      .active()
      .with("createdAt", createdAt)
      .withLastLogin(new Date());
  }
}

/**
 * Pre-configured user builders
 */
export const userBuilders = {
  /**
   * Basic user with email/password
   */
  basic: () => new UserBuilder().verified().active().withEmailAccount(),

  /**
   * Admin user
   */
  admin: () => new UserBuilder().admin(),

  /**
   * OAuth user
   */
  oauth: (provider = "google") => new UserBuilder().oauthUser(provider),

  /**
   * Unverified user
   */
  unverified: () => new UserBuilder().unverified().active().withEmailAccount(),

  /**
   * Locked user
   */
  locked: () => new UserBuilder().verified().locked(),

  /**
   * User with 2FA
   */
  with2FA: () =>
    new UserBuilder().verified().active().withEmailAccount().with2FA(),

  /**
   * New user
   */
  new: () => new UserBuilder().newUser(),

  /**
   * Old user
   */
  old: (years = 2) => new UserBuilder().oldUser(years),
};

/**
 * User builder factory
 */
export class UserBuilderFactory {
  private builders: UserBuilder[] = [];

  /**
   * Create a new user builder
   */
  create(): UserBuilder {
    const builder = new UserBuilder();
    this.builders.push(builder);
    return builder;
  }

  /**
   * Create multiple user builders
   */
  createMany(count: number): UserBuilder[] {
    return Array.from({ length: count }, () => this.create());
  }

  /**
   * Build all created users
   */
  buildAll(): User[] {
    return this.builders.map((builder) => builder.build());
  }

  /**
   * Reset factory
   */
  reset(): void {
    this.builders = [];
  }
}
