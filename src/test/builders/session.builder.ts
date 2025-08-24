import { Session } from "@/lib/types/prisma";
import { Session as NextAuthSession } from "next-auth";
import { ChainableBuilder } from "./base.builder";
import { generate } from "../utils/test-utils";

/**
 * Database session builder
 */
export class SessionBuilder extends ChainableBuilder<Session, SessionBuilder> {
  private sequence = 0;

  protected getDefaults(): Session {
    this.sequence++;
    const expires = new Date();
    expires.setDate(expires.getDate() + 30); // 30 days from now

    return {
      id: generate.uuid(),
      sessionToken: `session_token_${this.sequence}_${generate.string(20)}`,
      userId: generate.uuid(),
      expires,
    };
  }

  protected doBuild(): Session {
    return {
      ...this.getDefaults(),
      ...this.data,
    } as Session;
  }

  /**
   * Set session ID
   */
  withId(id: string): this {
    return this.with("id", id);
  }

  /**
   * Set session token
   */
  withToken(token: string): this {
    return this.with("sessionToken", token);
  }

  /**
   * Set user ID
   */
  forUser(userId: string): this {
    return this.with("userId", userId);
  }

  /**
   * Set expiration date
   */
  expiresAt(date: Date): this {
    return this.with("expires", date);
  }

  /**
   * Make session expire in minutes
   */
  expiresInMinutes(minutes: number): this {
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + minutes);
    return this.with("expires", expires);
  }

  /**
   * Make session expire in hours
   */
  expiresInHours(hours: number): this {
    const expires = new Date();
    expires.setHours(expires.getHours() + hours);
    return this.with("expires", expires);
  }

  /**
   * Make session expire in days
   */
  expiresInDays(days: number): this {
    const expires = new Date();
    expires.setDate(expires.getDate() + days);
    return this.with("expires", expires);
  }

  /**
   * Create expired session
   */
  expired(minutesAgo: number = 60): this {
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() - minutesAgo);
    return this.with("expires", expires);
  }

  /**
   * Create valid session (default 7 days)
   */
  valid(days: number = 7): this {
    return this.expiresInDays(days);
  }

  /**
   * Create session about to expire
   */
  expiringSoon(minutesLeft: number = 5): this {
    return this.expiresInMinutes(minutesLeft);
  }

  /**
   * Create fresh session (just created)
   */
  fresh(): this {
    // Session model doesn't have createdAt/updatedAt
    return this.expiresInDays(30);
  }

  /**
   * Create old session
   */
  old(daysOld: number = 20): this {
    // Session model doesn't have createdAt/updatedAt
    // Just set expiration based on age
    return this.expiresInDays(30 - daysOld);
  }
}

/**
 * NextAuth session builder
 */
export class NextAuthSessionBuilder extends ChainableBuilder<
  NextAuthSession,
  NextAuthSessionBuilder
> {
  protected getDefaults(): NextAuthSession {
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);

    return {
      user: {
        id: generate.uuid(),
        email: generate.email(),
        name: "Test User",
        image: null,
      },
      expires: expires.toISOString(),
    };
  }

  protected doBuild(): NextAuthSession {
    return {
      ...this.getDefaults(),
      ...this.data,
    } as NextAuthSession;
  }

  /**
   * Set user data
   */
  withUser(user: Partial<NextAuthSession["user"]>): this {
    const currentUser = this.data.user || { id: generate.uuid() };
    return this.with("user", {
      ...currentUser,
      ...user,
    } as NextAuthSession["user"]);
  }

  /**
   * Set user ID
   */
  withUserId(id: string): this {
    return this.withUser({ id });
  }

  /**
   * Set user email
   */
  withEmail(email: string): this {
    return this.withUser({ email });
  }

  /**
   * Set user name
   */
  withName(name: string): this {
    return this.withUser({ name });
  }

  /**
   * Set user image
   */
  withImage(image: string): this {
    return this.withUser({ image });
  }

  /**
   * Set expiration
   */
  expiresAt(date: Date): this {
    return this.with("expires", date.toISOString());
  }

  /**
   * Make session expire in days
   */
  expiresInDays(days: number): this {
    const expires = new Date();
    expires.setDate(expires.getDate() + days);
    return this.with("expires", expires.toISOString());
  }

  /**
   * Create expired session
   */
  expired(): this {
    const expires = new Date();
    expires.setHours(expires.getHours() - 1);
    return this.with("expires", expires.toISOString());
  }

  /**
   * Create admin session
   */
  admin(): this {
    return this.withUser({
      id: "admin-" + generate.uuid(),
      email: "admin@example.com",
      name: "Admin User",
      image: null,
    }).expiresInDays(30);
  }

  /**
   * Create guest session
   */
  guest(): this {
    return this.withUser({
      id: "guest-" + generate.uuid(),
      email: `guest-${generate.string()}@example.com`,
      name: "Guest User",
      image: null,
    }).expiresInDays(1);
  }

  /**
   * Create OAuth session
   */
  oauth(provider: string = "google"): this {
    return this.withUser({
      id: generate.uuid(),
      email: generate.email(`${provider}.com`),
      name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} User`,
      image: `https://example.com/avatar-${provider}.jpg`,
    }).expiresInDays(30);
  }
}

/**
 * Session builder factory for related sessions
 */
export class SessionBuilderFactory {
  private dbSessions: SessionBuilder[] = [];
  private authSessions: NextAuthSessionBuilder[] = [];

  /**
   * Create database session builder
   */
  createDbSession(): SessionBuilder {
    const builder = new SessionBuilder();
    this.dbSessions.push(builder);
    return builder;
  }

  /**
   * Create NextAuth session builder
   */
  createAuthSession(): NextAuthSessionBuilder {
    const builder = new NextAuthSessionBuilder();
    this.authSessions.push(builder);
    return builder;
  }

  /**
   * Create matching DB and Auth sessions for a user
   */
  createMatchingPair(userId: string): {
    dbSession: SessionBuilder;
    authSession: NextAuthSessionBuilder;
  } {
    const sessionToken = `session_${generate.string(32)}`;
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);

    const dbSession = this.createDbSession()
      .forUser(userId)
      .withToken(sessionToken)
      .expiresAt(expires);

    const authSession = this.createAuthSession()
      .withUserId(userId)
      .expiresAt(expires);

    return { dbSession, authSession };
  }

  /**
   * Build all sessions
   */
  buildAll(): {
    dbSessions: Session[];
    authSessions: NextAuthSession[];
  } {
    return {
      dbSessions: this.dbSessions.map((b) => b.build()),
      authSessions: this.authSessions.map((b) => b.build()),
    };
  }

  /**
   * Reset factory
   */
  reset(): void {
    this.dbSessions = [];
    this.authSessions = [];
  }
}

/**
 * Pre-configured session builders
 */
export const sessionBuilders = {
  /**
   * Valid database session
   */
  validDb: (userId?: string) => {
    const builder = new SessionBuilder().valid();
    return userId ? builder.forUser(userId) : builder;
  },

  /**
   * Expired database session
   */
  expiredDb: (userId?: string) => {
    const builder = new SessionBuilder().expired();
    return userId ? builder.forUser(userId) : builder;
  },

  /**
   * Valid auth session
   */
  validAuth: (userId?: string) => {
    const builder = new NextAuthSessionBuilder().expiresInDays(30);
    return userId ? builder.withUserId(userId) : builder;
  },

  /**
   * Expired auth session
   */
  expiredAuth: () => new NextAuthSessionBuilder().expired(),

  /**
   * Admin session
   */
  admin: () => new NextAuthSessionBuilder().admin(),

  /**
   * OAuth session
   */
  oauth: (provider = "google") => new NextAuthSessionBuilder().oauth(provider),

  /**
   * Guest session
   */
  guest: () => new NextAuthSessionBuilder().guest(),
};
