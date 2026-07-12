import { User, Account, Session } from "@/lib/types/prisma";
import { Session as NextAuthSession } from "next-auth";
import { CompositeBuilder } from "./base.builder";
import { UserBuilder } from "./user.builder";
import { SessionBuilder, NextAuthSessionBuilder } from "./session.builder";
import { AccountBuilder } from "./account.builder";
import { generate } from "../utils/test-utils";

/**
 * Complete test scenario with all related entities
 */
export interface TestScenario {
  user: User;
  accounts: Account[];
  session?: Session;
  authSession?: NextAuthSession;
}

/**
 * Test scenario builder for creating complete test setups
 */
export class TestScenarioBuilder {
  private userBuilder: UserBuilder;
  private accountBuilders: AccountBuilder[] = [];
  private sessionBuilder?: SessionBuilder;
  private authSessionBuilder?: NextAuthSessionBuilder;
  private built = false;

  constructor() {
    this.userBuilder = new UserBuilder();
  }

  /**
   * Configure user
   */
  withUser(configureFn: (builder: UserBuilder) => UserBuilder): this {
    if (this.built) {
      throw new Error("Cannot modify scenario after building");
    }
    this.userBuilder = configureFn(this.userBuilder);
    return this;
  }

  /**
   * Add account
   */
  withAccount(configureFn: (builder: AccountBuilder) => AccountBuilder): this {
    if (this.built) {
      throw new Error("Cannot modify scenario after building");
    }
    const accountBuilder = new AccountBuilder();
    this.accountBuilders.push(configureFn(accountBuilder));
    return this;
  }

  /**
   * Add multiple accounts
   */
  withAccounts(
    ...configureFns: Array<(builder: AccountBuilder) => AccountBuilder>
  ): this {
    configureFns.forEach((fn) => this.withAccount(fn));
    return this;
  }

  /**
   * Add session
   */
  withSession(configureFn: (builder: SessionBuilder) => SessionBuilder): this {
    if (this.built) {
      throw new Error("Cannot modify scenario after building");
    }
    this.sessionBuilder = configureFn(new SessionBuilder());
    return this;
  }

  /**
   * Add auth session
   */
  withAuthSession(
    configureFn: (builder: NextAuthSessionBuilder) => NextAuthSessionBuilder,
  ): this {
    if (this.built) {
      throw new Error("Cannot modify scenario after building");
    }
    this.authSessionBuilder = configureFn(new NextAuthSessionBuilder());
    return this;
  }

  /**
   * Build the complete scenario
   */
  build(): TestScenario {
    if (this.built) {
      throw new Error("Scenario has already been built");
    }
    this.built = true;

    // Build user first
    const user = this.userBuilder.build();

    // Build accounts with user ID
    const accounts = this.accountBuilders.map((builder) =>
      builder.forUser(user.id).build(),
    );

    // Build session with user ID if configured
    const session = this.sessionBuilder?.forUser(user.id).build();

    // Build auth session with user data if configured
    const authSession = this.authSessionBuilder
      ?.withUser({
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      })
      .build();

    return {
      user,
      accounts,
      session,
      authSession,
    };
  }

  /**
   * Clone the builder
   */
  clone(): TestScenarioBuilder {
    const cloned = new TestScenarioBuilder();
    cloned.userBuilder = this.userBuilder.clone();
    cloned.accountBuilders = this.accountBuilders.map((b) => b.clone());
    cloned.sessionBuilder = this.sessionBuilder?.clone();
    cloned.authSessionBuilder = this.authSessionBuilder?.clone();
    return cloned;
  }
}

/**
 * Pre-configured test scenarios
 */
export class TestScenarios {
  /**
   * New user registration scenario
   */
  static newRegistration(email?: string): TestScenario {
    return new TestScenarioBuilder()
      .withUser((u) =>
        u
          .withEmail(email || generate.email())
          .unverified()
          .withEmailAccount(),
      )
      .withAccount((a) => a.credentials(email || generate.email()))
      .build();
  }

  /**
   * Authenticated user scenario
   */
  static authenticatedUser(): TestScenario {
    return new TestScenarioBuilder()
      .withUser((u) => u.verified().active().withEmailAccount())
      .withAccount((a) => a.credentials(generate.email()))
      .withSession((s) => s.valid())
      .withAuthSession((as) => as.expiresInDays(30))
      .build();
  }

  /**
   * OAuth user scenario
   */
  static oauthUser(provider = "google"): TestScenario {
    return new TestScenarioBuilder()
      .withUser((u) => u.verified().active().oauthUser(provider))
      .withAccount((a) => (provider === "google" ? a.google() : a.github()))
      .withSession((s) => s.valid())
      .withAuthSession((as) => as.oauth(provider))
      .build();
  }

  /**
   * Multi-provider user scenario
   */
  static multiProviderUser(): TestScenario {
    return new TestScenarioBuilder()
      .withUser((u) =>
        u.verified().active().withEmailAccount().withGoogleAccount(),
      )
      .withAccounts(
        (a) => a.credentials(generate.email()),
        (a) => a.google(),
      )
      .withSession((s) => s.valid())
      .withAuthSession((as) => as.expiresInDays(30))
      .build();
  }

  /**
   * User with 2FA enabled
   */
  static userWith2FA(): TestScenario {
    return new TestScenarioBuilder()
      .withUser((u) => u.verified().active().withEmailAccount().with2FA())
      .withAccount((a) => a.credentials(generate.email()))
      .withSession((s) => s.valid())
      .withAuthSession((as) => as.expiresInDays(30))
      .build();
  }

  /**
   * Locked user scenario
   */
  static lockedUser(): TestScenario {
    return new TestScenarioBuilder()
      .withUser((u) => u.verified().locked().withEmailAccount())
      .withAccount((a) => a.credentials(generate.email()))
      .build();
  }

  /**
   * Expired session scenario
   */
  static expiredSession(): TestScenario {
    return new TestScenarioBuilder()
      .withUser((u) => u.verified().active().withEmailAccount())
      .withAccount((a) => a.credentials(generate.email()))
      .withSession((s) => s.expired())
      .withAuthSession((as) => as.expired())
      .build();
  }

  /**
   * Admin user scenario
   */
  static adminUser(): TestScenario {
    return new TestScenarioBuilder()
      .withUser((u) => u.admin())
      .withAccount((a) => a.credentials("admin@example.com"))
      .withSession((s) => s.valid())
      .withAuthSession((as) => as.admin())
      .build();
  }

  /**
   * Guest user scenario
   */
  static guestUser(): TestScenario {
    const guestEmail = `guest-${generate.string()}@example.com`;
    return new TestScenarioBuilder()
      .withUser((u) =>
        u.withEmail(guestEmail).withName("Guest User").verified().active(),
      )
      .withSession((s) => s.expiresInHours(1))
      .withAuthSession((as) => as.guest())
      .build();
  }

  /**
   * User migration scenario (from credentials to OAuth)
   */
  static userMigration(): {
    before: TestScenario;
    after: TestScenario;
  } {
    const email = generate.email();
    const userId = generate.uuid();

    const before = new TestScenarioBuilder()
      .withUser((u) =>
        u.withId(userId).withEmail(email).verified().withEmailAccount(),
      )
      .withAccount((a) => a.credentials(email))
      .build();

    const after = new TestScenarioBuilder()
      .withUser((u) =>
        u
          .withId(userId)
          .withEmail(email)
          .verified()
          .withEmailAccount()
          .withGoogleAccount(),
      )
      .withAccounts(
        (a) => a.credentials(email),
        (a) => a.google(),
      )
      .build();

    return { before, after };
  }
}

/**
 * Test data relationship builder
 */
export class TestDataBuilder {
  private scenarios: TestScenario[] = [];

  /**
   * Add a scenario
   */
  addScenario(scenario: TestScenario): this {
    this.scenarios.push(scenario);
    return this;
  }

  /**
   * Create related users (e.g., friends, team members)
   */
  createRelatedUsers(count: number, relationship?: string): TestScenario[] {
    const scenarios = Array.from({ length: count }, (_, i) => {
      return TestScenarios.authenticatedUser();
    });

    // Add relationship metadata if needed
    if (relationship) {
      scenarios.forEach((scenario) => {
        // Add relationship data to user metadata
        // This would be extended based on your schema
      });
    }

    this.scenarios.push(...scenarios);
    return scenarios;
  }

  /**
   * Create organization with users
   */
  createOrganization(
    name: string,
    userCount: number,
  ): {
    admin: TestScenario;
    members: TestScenario[];
  } {
    const admin = TestScenarios.adminUser();
    const members = this.createRelatedUsers(userCount - 1, "team_member");

    return { admin, members };
  }

  /**
   * Get all scenarios
   */
  getScenarios(): TestScenario[] {
    return this.scenarios;
  }

  /**
   * Get all users
   */
  getUsers(): User[] {
    return this.scenarios.map((s) => s.user);
  }

  /**
   * Get all accounts
   */
  getAccounts(): Account[] {
    return this.scenarios.flatMap((s) => s.accounts);
  }

  /**
   * Get all sessions
   */
  getSessions(): Session[] {
    return this.scenarios.filter((s) => s.session).map((s) => s.session!);
  }

  /**
   * Reset builder
   */
  reset(): void {
    this.scenarios = [];
  }
}

/**
 * Export all builders for easy access
 */
export { UserBuilder } from "./user.builder";
export { SessionBuilder, NextAuthSessionBuilder } from "./session.builder";
export { AccountBuilder } from "./account.builder";

/**
 * Central builder registry
 */
export const builders = {
  user: () => new UserBuilder(),
  session: () => new SessionBuilder(),
  authSession: () => new NextAuthSessionBuilder(),
  account: () => new AccountBuilder(),
  scenario: () => new TestScenarioBuilder(),
  testData: () => new TestDataBuilder(),
};
