import { Session } from "@/lib/types/prisma";
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
