/**
 * Integration tests with REAL PostgreSQL database
 * Requires Docker database to be running
 * Run with: pnpm run test:integration
 */

import {
  prismaTest as prisma,
  cleanupPrismaTest,
  openSecondPrismaTestClient,
} from "@/lib/prisma-test";
import { RegisterUserCommand } from "@/lib/commands/auth/register-user.command";
import { ChangePasswordCommand } from "@/lib/commands/auth/change-password.command";
import { UserRepository } from "@/lib/repositories/user/user.repository";
import {
  createVerifiedDecode,
  revokeSession,
  verifySessionToken,
} from "@/lib/auth/session-revocation";
import { authOptions } from "@/lib/auth-config";
import { LinkNotConfirmedError } from "@/lib/auth/link-gate";
import { issueLinkGrant, spendLinkGrant } from "@/lib/auth/link-grant";
import { UserBuilder } from "../../builders/user.builder";
import { AccountBuilder } from "../../builders/account.builder";
import { SessionBuilder } from "../../builders/session.builder";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import type { AdapterAccount, AdapterUser } from "next-auth/adapters";
import type { JWT } from "next-auth/jwt";

// Using properly configured test Prisma client
// Connection pooling is handled in prisma-test.ts

// The session guard and the link gate use the app's Prisma client: point it
// at the test database.
jest.mock("@/lib/prisma", () => ({
  prisma: require("@/lib/prisma-test").prismaTest,
}));

// The app's Auth.js options (src/lib/auth-config.ts) are loaded for their
// adapter. next-auth and its providers are ES modules that next/jest does not
// transform, so the stand-ins of the auth-config unit tests replace them; the
// Prisma adapter is the real one (jest.config.js lets it be transformed).
jest.mock("next-auth", () => {
  class CredentialsSignin extends Error {
    code = "credentials";
  }
  return { __esModule: true, CredentialsSignin };
});
jest.mock("next-auth/providers/credentials", () => ({
  __esModule: true,
  default: (options: unknown) => ({ id: "credentials", options }),
}));
jest.mock("next-auth/providers/google", () => ({
  __esModule: true,
  default: (options: unknown) => ({ id: "google", options }),
}));
// Sets a cookie of the request, and there is none here.
jest.mock("@/lib/auth/remember-login-method", () => ({
  rememberLoginMethod: jest.fn(),
}));

// Mock the repositories to use real Prisma
jest.mock("@/lib/repositories", () => ({
  repositories: {
    getUserRepository: () => ({
      findByEmail: async (email: string) => {
        return prisma.user.findUnique({ where: { email } });
      },
      findById: async (id: string) => {
        return prisma.user.findUnique({ where: { id } });
      },
      createWithAccount: async (data: {
        name?: string;
        email: string;
        password?: string;
        provider: string;
        providerAccountId: string;
      }) => {
        return prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              name: data.name,
              email: data.email,
              password: data.password,
              emailVerified: null,
            },
          });
          await tx.account.create({
            data: {
              userId: user.id,
              provider: data.provider,
              providerAccountId: data.providerAccountId,
              type: "credentials",
            },
          });
          return user;
        });
      },
      update: async (
        id: string,
        data: Partial<{
          name?: string;
          password?: string;
          emailVerified?: Date | null;
        }>,
      ) => {
        return prisma.user.update({ where: { id }, data });
      },
      updatePassword: (
        id: string,
        hash: string,
        options: { revokeSessions: boolean },
      ) => new UserRepository(prisma).updatePassword(id, hash, options),
      delete: async (id: string) => {
        await prisma.$transaction([
          prisma.account.deleteMany({ where: { userId: id } }),
          prisma.session.deleteMany({ where: { userId: id } }),
          prisma.user.delete({ where: { id } }),
        ]);
        return true;
      },
    }),
  },
}));

describe("Authentication Integration Tests (Real Database)", () => {
  beforeAll(async () => {
    // Connect to database
    await prisma.$connect();
    console.log("✅ Connected to test database");
  });

  afterAll(async () => {
    // Properly cleanup database connections
    await cleanupPrismaTest();
    console.log("✅ Disconnected from test database");
  });

  beforeEach(async () => {
    // Clean database before each test
    await prisma.$transaction([
      prisma.account.deleteMany(),
      prisma.session.deleteMany(),
      prisma.revokedSession.deleteMany(),
      prisma.verificationToken.deleteMany(),
      prisma.user.deleteMany(),
    ]);
    console.log("🧹 Cleaned database");
  });

  describe("User Registration - Real DB", () => {
    it("should register a new user in real database", async () => {
      // Arrange
      const registrationData = {
        name: "Real Test User",
        email: "realtest@example.com",
        password: "RealPass123!",
        confirmPassword: "RealPass123!",
      };

      const command = new RegisterUserCommand();

      // Act
      const result = await command.execute(registrationData);

      // Assert
      expect(result.success).toBe(true);

      // Verify in database
      const user = await prisma.user.findUnique({
        where: { email: registrationData.email },
        include: { accounts: true },
      });

      expect(user).toBeTruthy();
      expect(user?.name).toBe(registrationData.name);
      expect(user?.email).toBe(registrationData.email);
      expect(user?.accounts).toHaveLength(1);
      expect(user?.accounts[0].provider).toBe("credentials");

      // Verify password is hashed
      expect(user?.password).not.toBe(registrationData.password);
      const isPasswordValid = await bcrypt.compare(
        registrationData.password,
        user?.password || "",
      );
      expect(isPasswordValid).toBe(true);
    }, 10000); // 10 second timeout for registration with bcrypt

    it("should prevent duplicate registration in real database", async () => {
      // Arrange - Create first user
      await prisma.user.create({
        data: {
          name: "Existing User",
          email: "existing@example.com",
          password: await bcrypt.hash("Test123!", 4),
        },
      });

      const command = new RegisterUserCommand();

      // Act - Try to register with same email
      const result = await command.execute({
        name: "Another User",
        email: "existing@example.com",
        password: "Test123!",
        confirmPassword: "Test123!",
      });

      // Assert
      expect(result.success).toBe(false);

      // Verify only one user in database
      const users = await prisma.user.findMany({
        where: { email: "existing@example.com" },
      });
      expect(users).toHaveLength(1);
      expect(users[0].name).toBe("Existing User");
    });
  });

  describe("OAuth Integration - Real DB", () => {
    it("should create OAuth account in real database", async () => {
      // Arrange & Act
      const user = await prisma.user.create({
        data: {
          name: "OAuth User",
          email: "oauth@example.com",
          emailVerified: new Date(),
          image: "https://example.com/avatar.jpg",
        },
      });

      const account = await prisma.account.create({
        data: {
          userId: user.id,
          provider: "google",
          providerAccountId: "google-123456",
          type: "oauth",
          access_token: "ya29.token",
          refresh_token: "refresh.token",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: "Bearer",
          scope: "email profile",
        },
      });

      // Assert
      const userWithAccount = await prisma.user.findUnique({
        where: { id: user.id },
        include: { accounts: true },
      });

      expect(userWithAccount?.accounts).toHaveLength(1);
      expect(userWithAccount?.accounts[0].provider).toBe("google");
      expect(userWithAccount?.accounts[0].type).toBe("oauth");
      expect(userWithAccount?.password).toBeNull();
    });

    it("should link multiple providers to same user", async () => {
      // Arrange
      const user = await prisma.user.create({
        data: {
          name: "Multi Provider User",
          email: "multi@example.com",
          emailVerified: new Date(),
        },
      });

      // Act - Add multiple accounts
      await prisma.account.createMany({
        data: [
          {
            userId: user.id,
            provider: "google",
            providerAccountId: "google-789",
            type: "oauth",
          },
          {
            userId: user.id,
            provider: "github",
            providerAccountId: "github-456",
            type: "oauth",
          },
          {
            userId: user.id,
            provider: "credentials",
            providerAccountId: user.email,
            type: "credentials",
          },
        ],
      });

      // Assert
      const accounts = await prisma.account.findMany({
        where: { userId: user.id },
      });

      expect(accounts).toHaveLength(3);
      expect(accounts.map((a) => a.provider).sort()).toEqual([
        "credentials",
        "github",
        "google",
      ]);
    });
  });

  describe("Session Management - Real DB", () => {
    it("should create and manage sessions in real database", async () => {
      // Arrange
      const user = await prisma.user.create({
        data: {
          name: "Session User",
          email: "session@example.com",
          password: await bcrypt.hash("Test123!", 4),
        },
      });

      // Act - Create sessions
      const validSession = await prisma.session.create({
        data: {
          userId: user.id,
          sessionToken: `session_valid_${Date.now()}`,
          expires: new Date(Date.now() + 86400000), // Tomorrow
        },
      });

      const expiredSession = await prisma.session.create({
        data: {
          userId: user.id,
          sessionToken: `session_expired_${Date.now()}`,
          expires: new Date(Date.now() - 86400000), // Yesterday
        },
      });

      // Assert - Check sessions
      const allSessions = await prisma.session.findMany({
        where: { userId: user.id },
      });
      expect(allSessions).toHaveLength(2);

      // Clean expired sessions
      const deleted = await prisma.session.deleteMany({
        where: {
          expires: { lt: new Date() },
        },
      });
      expect(deleted.count).toBe(1);

      // Verify only valid session remains
      const remainingSessions = await prisma.session.findMany({
        where: { userId: user.id },
      });
      expect(remainingSessions).toHaveLength(1);
      expect(remainingSessions[0].id).toBe(validSession.id);
    });
  });

  describe("Password Management - Real DB", () => {
    it("should change password in real database", async () => {
      // Arrange
      const oldPassword = "OldPass123!";
      const newPassword = "NewPass456!";

      const user = await prisma.user.create({
        data: {
          name: "Password Change User",
          email: "passchange@example.com",
          password: await bcrypt.hash(oldPassword, 4),
        },
      });

      const command = new ChangePasswordCommand();

      // Act
      const result = await command.execute({
        userId: user.id,
        currentPassword: oldPassword,
        newPassword: newPassword,
        confirmPassword: newPassword,
      });

      // Assert
      expect(result.success).toBe(true);

      // Verify new password works
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });

      const isNewPasswordValid = await bcrypt.compare(
        newPassword,
        updatedUser?.password || "",
      );
      expect(isNewPasswordValid).toBe(true);

      const isOldPasswordValid = await bcrypt.compare(
        oldPassword,
        updatedUser?.password || "",
      );
      expect(isOldPasswordValid).toBe(false);

      expect(updatedUser?.lastPasswordChange).toBeTruthy();
      // The command asked for the sessions to end.
      expect(updatedUser?.sessionVersion).toBe(1);
    }, 15000); // 15 second timeout for password change with multiple bcrypt operations
  });

  describe("Database Transactions - Real DB", () => {
    it("should rollback on transaction failure", async () => {
      // Arrange
      const userData = {
        name: "Transaction Test",
        email: "transaction@example.com",
        password: await bcrypt.hash("Test123!", 4),
      };

      // Act - Try transaction that will fail
      try {
        await prisma.$transaction(async (tx) => {
          // Create user
          const user = await tx.user.create({ data: userData });

          // Try to create account with invalid data (missing required fields)
          await tx.account.create({
            data: {
              userId: user.id,
              provider: null as any, // This will cause an error
              providerAccountId: null as any,
              type: null as any,
            },
          });
        });
      } catch (error) {
        // Transaction should fail
      }

      // Assert - User should not exist due to rollback
      const user = await prisma.user.findUnique({
        where: { email: userData.email },
      });
      expect(user).toBeNull();
    }, 10000); // 10 second timeout for transaction rollback
  });

  describe("Bulk insert - Real DB", () => {
    // This test used to measure the insert and to assert that it took less
    // than 15 seconds. A limit on wall-clock time says how busy the machine
    // is, not whether the code works, so the measurement and the limit are
    // gone. What the test asserts is that every row is in the table.
    it("should store every user of one createMany", async () => {
      // Arrange - Create many users
      const users = Array.from({ length: 100 }, (_, i) => ({
        name: `Bulk User ${i}`,
        email: `bulk${i}@example.com`,
        password: bcrypt.hashSync("Test123!", 4),
      }));

      // Act
      await prisma.user.createMany({ data: users });

      // Assert
      const count = await prisma.user.count();
      expect(count).toBe(100);

      // Cleanup is handled by beforeEach
    }, 120000); // 2 minute timeout for bulk operations
  });

  // Kept in this file on purpose: its beforeEach wipes the users table, so a
  // second real-DB test file running in parallel would race with it.
  describe("Account lockout - Real DB", () => {
    const PASSWORD = "Correct123!";
    const policy = { maxAttempts: 3, lockoutMs: 15 * 60_000 };

    const makeUser = async (email: string) =>
      prisma.user.create({
        data: { email, password: await bcrypt.hash(PASSWORD, 4) },
      });

    it("counts concurrent failures atomically", async () => {
      const user = await makeUser("atomic@example.com");
      const repo = new UserRepository(prisma);

      await Promise.all(
        Array.from({ length: 8 }, () =>
          repo.registerFailedLogin(user.id, {
            maxAttempts: 100,
            lockoutMs: 60_000,
          }),
        ),
      );

      const row = await prisma.user.findUnique({ where: { id: user.id } });
      expect(row?.loginAttempts).toBe(8);
      expect(row?.lockedUntil).toBeNull();
    });

    it("locks at the threshold for exactly lockoutMs and reports it once", async () => {
      const user = await makeUser("threshold@example.com");
      const repo = new UserRepository(prisma);
      const now = new Date();

      const first = await repo.registerFailedLogin(user.id, policy, now);
      const second = await repo.registerFailedLogin(user.id, policy, now);
      expect(first.lockedNow).toBe(false);
      expect(second).toEqual({
        attempts: 2,
        lockedUntil: null,
        lockedNow: false,
      });

      const racing = await Promise.all(
        Array.from({ length: 3 }, () =>
          repo.registerFailedLogin(user.id, policy, now),
        ),
      );
      expect(racing.filter((r) => r.lockedNow)).toHaveLength(1);

      const row = await prisma.user.findUnique({ where: { id: user.id } });
      expect(row?.loginAttempts).toBe(5);
      expect(row?.lockedUntil?.getTime()).toBe(
        now.getTime() + policy.lockoutMs,
      );
    });

    it("verifyCredentials distinguishes valid, invalid and locked", async () => {
      const user = await makeUser("verify@example.com");
      const oauthOnly = await prisma.user.create({
        data: { email: "oauth-only@example.com" },
      });
      const repo = new UserRepository(prisma);

      await expect(
        repo.verifyCredentials("verify@example.com", PASSWORD),
      ).resolves.toMatchObject({ status: "valid", user: { id: user.id } });
      await expect(
        repo.verifyCredentials("verify@example.com", "wrong"),
      ).resolves.toEqual({ status: "invalid", userId: user.id });
      await expect(
        repo.verifyCredentials("nobody@example.com", PASSWORD),
      ).resolves.toEqual({ status: "invalid", userId: null });
      await expect(
        repo.verifyCredentials(oauthOnly.email, PASSWORD),
      ).resolves.toEqual({ status: "invalid", userId: null });

      await prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: 5, lockedUntil: new Date(Date.now() + 60_000) },
      });
      // Even the correct password is refused while the lock is active.
      await expect(
        repo.verifyCredentials("verify@example.com", PASSWORD),
      ).resolves.toMatchObject({ status: "locked", userId: user.id });
    });

    it("an expired lock is not enforced and the next failure starts a fresh count", async () => {
      const user = await makeUser("expired@example.com");
      await prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: 5, lockedUntil: new Date(Date.now() - 1000) },
      });
      const repo = new UserRepository(prisma);

      await expect(
        repo.verifyCredentials("expired@example.com", PASSWORD),
      ).resolves.toMatchObject({ status: "valid" });
      await expect(repo.registerFailedLogin(user.id, policy)).resolves.toEqual({
        attempts: 1,
        lockedUntil: null,
        lockedNow: false,
      });
    });

    it("recordSuccessfulLogin clears the counter and the lock", async () => {
      const user = await makeUser("reset@example.com");
      await prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: 2, lockedUntil: new Date(Date.now() - 1000) },
      });

      await new UserRepository(prisma).recordSuccessfulLogin(user.id);

      const row = await prisma.user.findUnique({ where: { id: user.id } });
      expect(row).toMatchObject({ loginAttempts: 0, lockedUntil: null });
      expect(row?.lastLoginAt).toBeTruthy();
    });
  });

  // The session guard (src/lib/auth/session-revocation.ts) and the password
  // write that ends sessions, on real PostgreSQL. In this file for the reason
  // given above.
  describe("Session revocation - Real DB", () => {
    const makeUser = async (email: string) =>
      prisma.user.create({
        data: { email, password: await bcrypt.hash("Correct123!", 4) },
      });

    const tokenFor = (
      userId: string,
      sid: string,
      claims: Record<string, unknown> = {},
    ): JWT =>
      ({
        id: userId,
        sub: userId,
        sid,
        sv: 0,
        role: "USER",
        ...claims,
      }) as JWT;

    it("a revoked session is refused, another session of the same user is not", async () => {
      const user = await makeUser("revoked@example.com");
      const signedOut = tokenFor(user.id, "sid-signed-out");
      const other = tokenFor(user.id, "sid-other");

      await expect(verifySessionToken(signedOut)).resolves.toBe(signedOut);
      await revokeSession(signedOut);

      await expect(verifySessionToken(signedOut)).resolves.toBeNull();
      await expect(verifySessionToken(other)).resolves.toBe(other);
    });

    it("two concurrent sign-outs of one session both succeed and leave one row", async () => {
      const token = tokenFor("no-user-needed", "sid-twice");

      await expect(
        Promise.all([revokeSession(token), revokeSession(token)]),
      ).resolves.toEqual([undefined, undefined]);

      await expect(
        prisma.revokedSession.count({ where: { sid: "sid-twice" } }),
      ).resolves.toBe(1);
    });

    it("the next sign-out deletes the expired rows and keeps the others", async () => {
      await prisma.revokedSession.createMany({
        data: [
          { sid: "sid-expired", expires: new Date(Date.now() - 1000) },
          { sid: "sid-current", expires: new Date(Date.now() + 60_000) },
        ],
      });

      await revokeSession(tokenFor("no-user-needed", "sid-new"));

      const rows = await prisma.revokedSession.findMany({
        select: { sid: true },
        orderBy: { sid: "asc" },
      });
      expect(rows.map((row) => row.sid)).toEqual(["sid-current", "sid-new"]);
    });

    it("a session of a deleted user is refused", async () => {
      const user = await makeUser("deleted@example.com");
      const token = tokenFor(user.id, "sid-deleted-user");
      await expect(verifySessionToken(token)).resolves.toBe(token);

      await prisma.user.delete({ where: { id: user.id } });

      await expect(verifySessionToken(token)).resolves.toBeNull();
    });

    it("a role change in the database reaches the token at the next check", async () => {
      const user = await makeUser("demoted@example.com");
      await prisma.user.update({
        where: { id: user.id },
        data: { role: "ADMIN" },
      });
      const token = tokenFor(user.id, "sid-role", { role: "ADMIN" });
      await expect(verifySessionToken(token)).resolves.toMatchObject({
        role: "ADMIN",
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { role: "USER" },
      });

      await expect(verifySessionToken(token)).resolves.toMatchObject({
        role: "USER",
      });
    });

    it("updatePassword() with revokeSessions false leaves the session version alone", async () => {
      const user = await makeUser("add-password@example.com");
      const hash = await bcrypt.hash("Another123!", 4);

      await new UserRepository(prisma).updatePassword(user.id, hash, {
        revokeSessions: false,
      });

      const row = await prisma.user.findUnique({ where: { id: user.id } });
      expect(row).toMatchObject({ password: hash, sessionVersion: 0 });
    });

    it("updatePassword() with revokeSessions stores the hash and bumps the session version", async () => {
      const user = await makeUser("bump@example.com");
      const repo = new UserRepository(prisma);
      const first = await bcrypt.hash("Another123!", 4);
      const second = await bcrypt.hash("YetAnother123!", 4);

      await repo.updatePassword(user.id, first, { revokeSessions: true });
      await expect(
        prisma.user.findUnique({ where: { id: user.id } }),
      ).resolves.toMatchObject({ password: first, sessionVersion: 1 });

      await repo.updatePassword(user.id, second, { revokeSessions: true });
      await expect(
        prisma.user.findUnique({ where: { id: user.id } }),
      ).resolves.toMatchObject({ password: second, sessionVersion: 2 });
    });

    it("a password change ends the sessions issued before it, not the ones after", async () => {
      const user = await makeUser("everywhere@example.com");
      const before = tokenFor(user.id, "sid-before", { sv: 0 });
      const after = tokenFor(user.id, "sid-after", { sv: 1 });
      await expect(verifySessionToken(before)).resolves.toBe(before);

      await new UserRepository(prisma).updatePassword(
        user.id,
        await bcrypt.hash("Another123!", 4),
        { revokeSessions: true },
      );

      await expect(verifySessionToken(before)).resolves.toBeNull();
      await expect(verifySessionToken(after)).resolves.toBe(after);
    });
  });

  // What the two groups below share: the adapter object that the application
  // hands to Auth.js, and the rows they look at.
  const LINK_PASSWORD_HASH = bcrypt.hashSync("Correct123!", 4);

  /** authOptions.adapter.linkAccount: what Auth.js calls to write an Account row. */
  const linkThroughTheAppsAdapter = (account: AdapterAccount) =>
    authOptions.adapter.linkAccount(account);

  const googleAccount = (
    userId: string,
    providerAccountId: string,
  ): AdapterAccount => ({
    userId,
    type: "oidc",
    provider: "google",
    providerAccountId,
    access_token: "access-token-from-google",
  });

  /** A user as registration writes it: a password and its credentials Account row. */
  const makePasswordUser = async (email: string) => {
    const user = await prisma.user.create({
      data: { email, password: LINK_PASSWORD_HASH },
    });
    await prisma.account.create({
      data: {
        userId: user.id,
        type: "credentials",
        provider: "credentials",
        providerAccountId: email,
      },
    });
    return user;
  };

  /** A user that signs in with Google only: no password, one google Account row. */
  const makeGoogleOnlyUser = async (
    email: string,
    providerAccountId: string,
  ) => {
    const user = await prisma.user.create({
      data: { email, emailVerified: new Date() },
    });
    await prisma.account.create({
      data: {
        userId: user.id,
        type: "oidc",
        provider: "google",
        providerAccountId,
      },
    });
    return user;
  };

  /**
   * Three user rows that are not the row of a first sign-in (no password, no
   * Account row, e-mail not verified): each has one of the three.
   */
  const notAFirstSignIn: [
    string,
    (email: string) => Promise<{ id: string }>,
  ][] = [
    [
      "has a password and no Account row (as scripts/create-user.ts writes it)",
      (email) =>
        prisma.user.create({ data: { email, password: LINK_PASSWORD_HASH } }),
    ],
    [
      "has no password and one Google account",
      async (email) => {
        const user = await prisma.user.create({ data: { email } });
        await prisma.account.create({
          data: {
            userId: user.id,
            type: "oidc",
            provider: "google",
            providerAccountId: "g-first",
          },
        });
        return user;
      },
    ],
    [
      "has no password, no Account row and a verified e-mail",
      (email) =>
        prisma.user.create({ data: { email, emailVerified: new Date() } }),
    ],
  ];

  const googleAccountIdsOf = async (userId: string) => {
    const accounts = await prisma.account.findMany({
      where: { userId, provider: "google" },
      select: { providerAccountId: true },
      orderBy: { providerAccountId: "asc" },
    });
    return accounts.map((account) => account.providerAccountId);
  };

  /** The events the gate wrote for a user, oldest first. */
  const gateEventsOf = (userId: string) =>
    prisma.securityEvent.findMany({
      where: {
        userId,
        eventType: { in: ["account_link_completed", "account_link_refused"] },
      },
      orderBy: { createdAt: "asc" },
      select: { eventType: true, success: true, metadata: true },
    });

  const REFUSED_WITHOUT_GRANT = {
    eventType: "account_link_refused",
    success: false,
    metadata: { provider: "google", reason: "no_grant" },
  };

  /** The two columns of a link grant, as the row holds them. */
  const grantOf = (userId: string) =>
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { linkGrantProvider: true, linkGrantExpiresAt: true },
    });

  const NO_GRANT = { linkGrantProvider: null, linkGrantExpiresAt: null };

  type SecondClient = ReturnType<typeof openSecondPrismaTestClient>;

  // The three tests that force an overlap hold a lock on a second client and
  // wait for a state of PostgreSQL. One such wait takes LOCK_WAIT_MS at most,
  // and the transaction that holds the lock is given LOCK_HOLD_LIMIT_MS.
  // Each of the three tests has a limit of its own in Jest, 30 s: above its
  // waits added up (one in two of them, two in the third) and above the limit
  // of the transaction. With Jest's default of 5 s, which is one wait, a test
  // that did not see its state was reported as "Exceeded timeout", never with
  // the message of the wait, and Jest went on to the next test while the
  // calls of this one were still running (measured for all three: links that
  // the second and the third had started then failed to write their event
  // for a user that the next test had deleted).
  const LOCK_WAIT_MS = 5_000;
  const LOCK_HOLD_LIMIT_MS = 15_000;

  /**
   * Resolves when PostgreSQL shows `howMany` statements that match `statement`
   * waiting for a lock. A bounded wait for a state, not a second attempt: the
   * test goes on only when the calls it started are seen waiting.
   */
  async function untilWaitingForALock(
    holder: SecondClient,
    statement: string,
    howMany: number,
  ): Promise<void> {
    const deadline = Date.now() + LOCK_WAIT_MS;
    for (;;) {
      const [{ waiting }] = await holder.$queryRaw<
        { waiting: number }[]
      >`SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query LIKE ${statement}`;
      if (waiting === howMany) return;
      if (Date.now() > deadline) {
        throw new Error(
          `${waiting} of ${howMany} calls were waiting for the lock after ` +
            `${LOCK_WAIT_MS / 1000} s`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  /**
   * Starts the calls while a second client holds a lock on the user's row,
   * and releases the lock once each of them waits for it in PostgreSQL: their
   * UPDATEs then really overlap. Run one after the other they would prove
   * nothing about single use. The second client has a pool of its own, so
   * the pool of the shared one (two connections in CI) is not what puts the
   * calls in a row.
   *
   * When the wait fails, the lock is released all the same, and the calls
   * are left to end before the failure is handed on: nothing of a failed test
   * is still held or still running when the next one starts.
   */
  async function whileTheRowIsLocked<T>(
    userId: string,
    start: () => Promise<T>[],
  ): Promise<PromiseSettledResult<T>[]> {
    const holder = openSecondPrismaTestClient();
    // What the calls became: set when they are started, and it never rejects.
    let settled: Promise<PromiseSettledResult<T>[]> = Promise.resolve([]);
    try {
      await holder.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
          const calls = start();
          settled = Promise.allSettled(calls);
          await untilWaitingForALock(holder, 'UPDATE%"User"%', calls.length);
        },
        { timeout: LOCK_HOLD_LIMIT_MS },
      );
      return await settled;
    } finally {
      // The transaction has ended here, committed or rolled back, and the
      // lock with it; a connection that is closed ends its transaction too.
      // Only after that can the calls end.
      await holder.$disconnect();
      await settled;
    }
  }

  /**
   * Runs `during` while a second client holds every INSERT into "Account"
   * back (a table lock that lets the table be read). `during` starts links
   * on the shared client and says, through `inserts`, how many of them have
   * to be seen waiting before it goes on. The lock is released when `during`
   * returns and when it fails; the links it started are the caller's to wait
   * for.
   */
  async function whileNoAccountRowCanBeWritten<T>(
    during: (inserts: (howMany: number) => Promise<void>) => Promise<T>,
  ): Promise<T> {
    const holder = openSecondPrismaTestClient();
    try {
      return await holder.$transaction(
        async (tx) => {
          await tx.$executeRaw`LOCK TABLE "Account" IN SHARE ROW EXCLUSIVE MODE`;
          return during((howMany) =>
            untilWaitingForALock(holder, 'INSERT%"Account"%', howMany),
          );
        },
        { timeout: LOCK_HOLD_LIMIT_MS },
      );
    } finally {
      await holder.$disconnect();
    }
  }

  // The link gate (src/lib/auth/link-gate.ts), through the adapter object the
  // application hands to Auth.js, on real PostgreSQL: Auth.js writes an
  // Account row through adapter.linkAccount and nothing else. In this file for
  // the reason given above.
  describe("Account-link gate - Real DB", () => {
    it("refuses to link a Google account onto a user with a password when no password step left a grant", async () => {
      const victim = await makePasswordUser("victim@example.com");

      await expect(
        linkThroughTheAppsAdapter(googleAccount(victim.id, "g-attacker")),
      ).rejects.toMatchObject({
        name: "LinkNotConfirmedError",
        reason: "no_grant",
      });

      await expect(googleAccountIdsOf(victim.id)).resolves.toEqual([]);
      await expect(gateEventsOf(victim.id)).resolves.toEqual([
        REFUSED_WITHOUT_GRANT,
      ]);
    });

    it("links without a grant onto the row Auth.js has just created for a first Google sign-in", async () => {
      const createUser = authOptions.adapter.createUser;
      if (!createUser) throw new Error("authOptions.adapter has no createUser");
      // What @auth/core passes for a new visitor (handle-login.js:260): the
      // profile and `emailVerified: null`. The adapter drops the id.
      const created = await createUser({
        id: "ignored",
        name: "New Visitor",
        email: "new-visitor@example.com",
        image: null,
        emailVerified: null,
      } as AdapterUser);

      await linkThroughTheAppsAdapter(googleAccount(created.id, "g-new"));

      await expect(googleAccountIdsOf(created.id)).resolves.toEqual(["g-new"]);
      await expect(gateEventsOf(created.id)).resolves.toEqual([]);
    });

    // Each row differs from the one above in one thing, so each of the three
    // conditions of the grant-free branch is needed.
    it.each(notAFirstSignIn)(
      "refuses without a grant when the user %s",
      async (_, make) => {
        const user = await make("not-new@example.com");
        const accountsBefore = await prisma.account.count();

        await expect(
          linkThroughTheAppsAdapter(googleAccount(user.id, "g-second")),
        ).rejects.toMatchObject({
          name: "LinkNotConfirmedError",
          reason: "no_grant",
        });

        await expect(prisma.account.count()).resolves.toBe(accountsBefore);
        await expect(gateEventsOf(user.id)).resolves.toEqual([
          REFUSED_WITHOUT_GRANT,
        ]);
      },
    );

    it("refuses for a user id that no row has, and does not try to write an event", async () => {
      // The events are not counted: that would show nothing. One for a user
      // id that no row has cannot be stored (foreign key), and
      // logSecurityEvent keeps a write that failed to itself. It logs it,
      // and that is looked for.
      const logged = jest.spyOn(console, "error").mockImplementation(() => {});
      try {
        await expect(
          linkThroughTheAppsAdapter(googleAccount("no-such-user", "g-nobody")),
        ).rejects.toMatchObject({
          name: "LinkNotConfirmedError",
          reason: "user_not_found",
        });

        expect(logged).not.toHaveBeenCalledWith(
          "Failed to log security event:",
          expect.anything(),
        );
      } finally {
        logged.mockRestore();
      }
      await expect(prisma.account.count()).resolves.toBe(0);
    });

    it("links once after the password step left a grant: the grant is used up, the link is recorded, and a second link is refused", async () => {
      const user = await makePasswordUser("honest@example.com");
      await issueLinkGrant(user.id, "google");

      await linkThroughTheAppsAdapter(googleAccount(user.id, "g-own"));

      await expect(
        prisma.account.findMany({
          where: { userId: user.id, provider: "google" },
        }),
      ).resolves.toMatchObject([
        {
          type: "oidc",
          providerAccountId: "g-own",
          access_token: "access-token-from-google",
        },
      ]);
      await expect(grantOf(user.id)).resolves.toEqual(NO_GRANT);
      await expect(gateEventsOf(user.id)).resolves.toEqual([
        {
          eventType: "account_link_completed",
          success: true,
          metadata: { provider: "google", providerAccountId: "g-own" },
        },
      ]);

      const second = await linkThroughTheAppsAdapter(
        googleAccount(user.id, "g-other"),
      ).catch((error: unknown) => error);

      expect(second).toBeInstanceOf(LinkNotConfirmedError);
      expect(second).toMatchObject({ reason: "no_grant" });
      await expect(googleAccountIdsOf(user.id)).resolves.toEqual(["g-own"]);
    });

    it("a grant can be spent until 300 seconds after the password step, and no longer at that moment", async () => {
      const user = await makePasswordUser("lifetime@example.com");
      const issuedAt = new Date();
      const after = (ms: number) => new Date(issuedAt.getTime() + ms);

      await issueLinkGrant(user.id, "google", issuedAt);
      await expect(grantOf(user.id)).resolves.toEqual({
        linkGrantProvider: "google",
        linkGrantExpiresAt: after(300_000),
      });
      // The end is compared by PostgreSQL, on the stored value.
      await expect(
        spendLinkGrant(user.id, "google", after(299_999)),
      ).resolves.toBe(true);

      await issueLinkGrant(user.id, "google", issuedAt);
      await expect(
        spendLinkGrant(user.id, "google", after(300_000)),
      ).resolves.toBe(false);
      // Not spent: it is still in the row, and of no use.
      await expect(grantOf(user.id)).resolves.toEqual({
        linkGrantProvider: "google",
        linkGrantExpiresAt: after(300_000),
      });
    });

    it("a grant that has ended does not let the gate link", async () => {
      const user = await makePasswordUser("ended@example.com");
      await issueLinkGrant(user.id, "google", new Date(Date.now() - 300_001));

      await expect(
        linkThroughTheAppsAdapter(googleAccount(user.id, "g-late")),
      ).rejects.toMatchObject({ reason: "no_grant" });

      await expect(googleAccountIdsOf(user.id)).resolves.toEqual([]);
    });

    it("a grant is for one provider: it lets no other provider be linked, and stays", async () => {
      const user = await makePasswordUser("provider@example.com");
      await issueLinkGrant(user.id, "google");

      await expect(spendLinkGrant(user.id, "github")).resolves.toBe(false);
      await expect(
        linkThroughTheAppsAdapter({
          ...googleAccount(user.id, "gh-1"),
          provider: "github",
        }),
      ).rejects.toMatchObject({ reason: "no_grant" });

      await expect(
        prisma.account.count({ where: { provider: "github" } }),
      ).resolves.toBe(0);
      await expect(grantOf(user.id)).resolves.toMatchObject({
        linkGrantProvider: "google",
      });
      await expect(spendLinkGrant(user.id, "google")).resolves.toBe(true);
    });

    it("a grant is for one user: it lets nothing be linked onto another user, and stays", async () => {
      const granted = await makePasswordUser("granted@example.com");
      const other = await makePasswordUser("other@example.com");
      await issueLinkGrant(granted.id, "google");

      await expect(
        linkThroughTheAppsAdapter(googleAccount(other.id, "g-other")),
      ).rejects.toMatchObject({ reason: "no_grant" });

      await expect(googleAccountIdsOf(other.id)).resolves.toEqual([]);
      await expect(grantOf(granted.id)).resolves.toMatchObject({
        linkGrantProvider: "google",
      });
      await expect(spendLinkGrant(granted.id, "google")).resolves.toBe(true);
    });

    it("refuses a second Google account for a user that has one, and uses the grant up", async () => {
      const user = await makePasswordUser("already@example.com");
      await prisma.account.create({
        data: {
          userId: user.id,
          type: "oidc",
          provider: "google",
          providerAccountId: "g-first",
        },
      });
      // A grant the password step would not have written for this user (the
      // route answers "already linked"): written here as a second password
      // step that raced a completed link would have left it.
      await issueLinkGrant(user.id, "google");

      await expect(
        linkThroughTheAppsAdapter(googleAccount(user.id, "g-second")),
      ).rejects.toMatchObject({
        name: "LinkNotConfirmedError",
        reason: "already_linked",
      });

      await expect(googleAccountIdsOf(user.id)).resolves.toEqual(["g-first"]);
      await expect(grantOf(user.id)).resolves.toEqual(NO_GRANT);
      await expect(gateEventsOf(user.id)).resolves.toEqual([
        {
          eventType: "account_link_refused",
          success: false,
          metadata: { provider: "google", reason: "already_linked" },
        },
      ]);
    });

    it("two spends of one grant that overlap: exactly one wins", async () => {
      const user = await makePasswordUser("race-spend@example.com");
      await issueLinkGrant(user.id, "google");

      const results = await whileTheRowIsLocked(user.id, () => [
        spendLinkGrant(user.id, "google"),
        spendLinkGrant(user.id, "google"),
      ]);

      expect(results.map((result) => result.status)).toEqual([
        "fulfilled",
        "fulfilled",
      ]);
      expect(
        results
          .map((result) => result.status === "fulfilled" && result.value)
          .sort(),
      ).toEqual([false, true]);
      await expect(grantOf(user.id)).resolves.toEqual(NO_GRANT);
    }, 30_000); // above the waits for the lock and the limit of its transaction

    it("two links with one grant that overlap, each with another Google account: one is linked, the other is refused for the grant", async () => {
      const user = await makePasswordUser("race-link@example.com");
      await issueLinkGrant(user.id, "google");

      // Two different Google accounts: the unique index on (provider,
      // providerAccountId) cannot be what refuses the second one.
      const results = await whileTheRowIsLocked(user.id, () => [
        linkThroughTheAppsAdapter(googleAccount(user.id, "g-one")),
        linkThroughTheAppsAdapter(googleAccount(user.id, "g-two")),
      ]);

      const refusals = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      expect(results).toHaveLength(2);
      expect(refusals).toHaveLength(1);
      expect(refusals[0]).toBeInstanceOf(LinkNotConfirmedError);
      expect(refusals[0]).toMatchObject({ reason: "no_grant" });
      await expect(googleAccountIdsOf(user.id)).resolves.toHaveLength(1);
      const events = await gateEventsOf(user.id);
      expect(events.map((event) => event.eventType).sort()).toEqual([
        "account_link_completed",
        "account_link_refused",
      ]);
    }, 30_000); // above the waits for the lock and the limit of its transaction

    // What the gate does NOT prevent, and SECURITY.md says so ("Not one
    // transaction"): it looks for an account of the provider in the row it
    // read before it spent the grant, and the Account row is written by a
    // third statement.
    it("two password steps whose links overlap, each with a grant of its own: both Google accounts are linked", async () => {
      const user = await makePasswordUser("two-steps@example.com");
      // What each link that was started became: these never reject.
      const outcomes: Promise<unknown>[] = [];
      const outcomeOf = (link: Promise<void>) => {
        const outcome = link.then(
          () => "linked",
          (error: unknown) => error,
        );
        outcomes.push(outcome);
        return outcome;
      };

      try {
        const { links } = await whileNoAccountRowCanBeWritten(
          async (inserts) => {
            await issueLinkGrant(user.id, "google");
            const first = outcomeOf(
              linkThroughTheAppsAdapter(googleAccount(user.id, "g-one")),
            );
            await inserts(1);
            // The first link has spent its grant and waits to write its row.
            // This is what a second password step reads: no grant, no Google
            // account. It writes a grant.
            await expect(grantOf(user.id)).resolves.toEqual(NO_GRANT);
            await expect(googleAccountIdsOf(user.id)).resolves.toEqual([]);
            await issueLinkGrant(user.id, "google");
            const second = outcomeOf(
              linkThroughTheAppsAdapter(googleAccount(user.id, "g-two")),
            );
            await inserts(2);
            // Wrapped: a promise returned as it is would be awaited there,
            // with the lock still held.
            return { links: Promise.all([first, second]) };
          },
        );

        await expect(links).resolves.toEqual(["linked", "linked"]);
        await expect(googleAccountIdsOf(user.id)).resolves.toEqual([
          "g-one",
          "g-two",
        ]);
        const events = await gateEventsOf(user.id);
        expect(events.map((event) => event.eventType)).toEqual([
          "account_link_completed",
          "account_link_completed",
        ]);
      } finally {
        // The lock is released by now. A test that failed lets the links it
        // started end before it does: none runs on into the next test.
        await Promise.all(outcomes);
      }
    }, 30_000); // above the waits for the lock and the limit of its transaction

    // The password step writes the grant and its event in one transaction
    // (the initiate route). On the mocked client of the route's unit test a
    // transaction is a model; here PostgreSQL takes the grant back.
    it("a grant written in a transaction that fails does not stay on the row", async () => {
      const user = await makePasswordUser("taken-back@example.com");

      await expect(
        prisma.$transaction(async (tx) => {
          await issueLinkGrant(user.id, "google", new Date(), tx);
          throw new Error("the event cannot be written");
        }),
      ).rejects.toThrow("the event cannot be written");
      await expect(grantOf(user.id)).resolves.toEqual(NO_GRANT);

      // The same write in a transaction that ends well: the grant is there.
      await prisma.$transaction((tx) =>
        issueLinkGrant(user.id, "google", new Date(), tx),
      );
      await expect(grantOf(user.id)).resolves.toMatchObject({
        linkGrantProvider: "google",
      });
    });
  });

  // Auth.js's own decision (handleLoginOrRegister of @auth/core, the function
  // the OAuth callback calls once Google has answered), run with the adapter
  // of the application on real PostgreSQL. What it does not run: the OAuth
  // exchange before it, and what Auth.js does with an error the adapter
  // throws (it wraps it and answers a redirect). In this file for the reason
  // given above.
  describe("Auth.js handleLoginOrRegister with the gated adapter - Real DB", () => {
    type HandleLoginOrRegister = (
      sessionToken: string | undefined,
      profile: { id: string; name: string; email: string; image: null },
      account: {
        provider: string;
        type: "oidc";
        providerAccountId: string;
        access_token: string;
      },
      options: unknown,
    ) => Promise<{ user: { id: string; email: string }; isNewUser: boolean }>;

    // @auth/core is no dependency of this project and exports no "./lib": the
    // file is found beside next-auth, through next-auth's real path under
    // node_modules/.pnpm (the path Jest's transform patterns are matched on).
    const loadHandleLogin = () => {
      const nextAuth = fs.realpathSync(
        path.join(process.cwd(), "node_modules", "next-auth"),
      );
      const core = fs.realpathSync(path.join(nextAuth, "..", "@auth", "core"));
      return jest.requireActual<{
        handleLoginOrRegister: HandleLoginOrRegister;
      }>(path.join(core, "lib", "actions", "callback", "handle-login.js"))
        .handleLoginOrRegister;
    };

    // What handleLoginOrRegister reads from the options of Auth.js. The
    // session cookie is decoded by the app's own session check
    // (src/lib/auth.ts) over a decode that reads JSON instead of a JWE, so
    // the session id and the session version are checked against real rows.
    // `ofOnesOwn` is what a kit user might add to the application's
    // configuration: an option of the provider, an event.
    const authJsOptions = (
      ofOnesOwn: {
        allowDangerousEmailAccountLinking?: boolean;
        createUser?: (message: { user: { id: string } }) => Promise<void>;
      } = {},
    ) => ({
      adapter: authOptions.adapter,
      jwt: {
        decode: createVerifiedDecode(async ({ token }) =>
          token ? JSON.parse(token) : null,
        ),
      },
      events: { createUser: ofOnesOwn.createUser },
      session: {
        strategy: "jwt",
        maxAge: 60,
        generateSessionToken: () => "unused",
      },
      cookies: { sessionToken: { name: "authjs.session-token" } },
      provider: {
        id: "google",
        type: "oidc",
        account: (tokens: Record<string, unknown>) => tokens,
        allowDangerousEmailAccountLinking:
          ofOnesOwn.allowDangerousEmailAccountLinking,
      },
    });

    const sessionTokenOf = (userId: string, sid: string) =>
      JSON.stringify({ id: userId, sub: userId, sid, sv: 0, role: "USER" });

    /**
     * A Google sign-in that returns, with or without a session cookie, to
     * Auth.js as the application configures it or with `options` of one's own.
     */
    const googleReturns = (
      sessionToken: string | undefined,
      subject: string,
      email: string,
      options: unknown = authJsOptions(),
    ) =>
      loadHandleLogin()(
        sessionToken,
        { id: subject, name: "Google Name", email, image: null },
        {
          provider: "google",
          type: "oidc",
          providerAccountId: subject,
          access_token: "access-token-from-google",
        },
        options,
      );

    it("Jest loads the handle-login.js of @auth/core as it is installed", () => {
      expect(typeof loadHandleLogin()).toBe("function");
    });

    it("a new visitor is created and linked without a grant", async () => {
      const result = await googleReturns(
        undefined,
        "g-new",
        "new-visitor@example.com",
      );

      expect(result.isNewUser).toBe(true);
      const row = await prisma.user.findUniqueOrThrow({
        where: { email: "new-visitor@example.com" },
      });
      expect(result.user.id).toBe(row.id);
      await expect(googleAccountIdsOf(row.id)).resolves.toEqual(["g-new"]);
      await expect(gateEventsOf(row.id)).resolves.toEqual([]);
    });

    it("a returning Google user signs in, with a session of that user or without one, and nothing is linked", async () => {
      const user = await makeGoogleOnlyUser("returning@example.com", "g-own");

      const withoutSession = await googleReturns(
        undefined,
        "g-own",
        "returning@example.com",
      );
      const withSession = await googleReturns(
        sessionTokenOf(user.id, "sid-returning"),
        "g-own",
        "returning@example.com",
      );

      expect(withoutSession).toMatchObject({
        user: { id: user.id },
        isNewUser: false,
      });
      expect(withSession).toMatchObject({
        user: { id: user.id },
        isNewUser: false,
      });
      await expect(googleAccountIdsOf(user.id)).resolves.toEqual(["g-own"]);
      await expect(prisma.account.count()).resolves.toBe(1);
      await expect(gateEventsOf(user.id)).resolves.toEqual([]);
    });

    it("a visitor without a session whose Google e-mail belongs to a password user is refused by Auth.js, before the gate: a live grant of that user is not spent", async () => {
      const user = await makePasswordUser("taken@example.com");
      await issueLinkGrant(user.id, "google");

      await expect(
        googleReturns(undefined, "g-same-email", "taken@example.com"),
      ).rejects.toMatchObject({ type: "OAuthAccountNotLinked" });

      await expect(googleAccountIdsOf(user.id)).resolves.toEqual([]);
      await expect(gateEventsOf(user.id)).resolves.toEqual([]);
      await expect(grantOf(user.id)).resolves.toMatchObject({
        linkGrantProvider: "google",
      });
    });

    it("a signed-in user whose Google account belongs to another user is refused by Auth.js, before the gate: the grant of the password step is not spent", async () => {
      const signedIn = await makePasswordUser("signed-in@example.com");
      const owner = await makeGoogleOnlyUser("owner@example.com", "g-owned");
      await issueLinkGrant(signedIn.id, "google");

      await expect(
        googleReturns(
          sessionTokenOf(signedIn.id, "sid-signed-in"),
          "g-owned",
          "owner@example.com",
        ),
      ).rejects.toMatchObject({ type: "OAuthAccountNotLinked" });

      await expect(googleAccountIdsOf(signedIn.id)).resolves.toEqual([]);
      await expect(googleAccountIdsOf(owner.id)).resolves.toEqual(["g-owned"]);
      await expect(gateEventsOf(signedIn.id)).resolves.toEqual([]);
      await expect(grantOf(signedIn.id)).resolves.toMatchObject({
        linkGrantProvider: "google",
      });
    });

    it("a live session after the password step links the Google account, once", async () => {
      const user = await makePasswordUser("honest@example.com");
      await issueLinkGrant(user.id, "google");

      const result = await googleReturns(
        sessionTokenOf(user.id, "sid-honest"),
        "g-own",
        "own-google-address@example.com",
      );

      expect(result).toMatchObject({ user: { id: user.id }, isNewUser: false });
      await expect(googleAccountIdsOf(user.id)).resolves.toEqual(["g-own"]);
      await expect(grantOf(user.id)).resolves.toEqual(NO_GRANT);
      await expect(gateEventsOf(user.id)).resolves.toEqual([
        {
          eventType: "account_link_completed",
          success: true,
          metadata: { provider: "google", providerAccountId: "g-own" },
        },
      ]);
      // Auth.js created no user for the Google address.
      await expect(prisma.user.count()).resolves.toBe(1);
    });

    it("a live session without the password step cannot link a Google account", async () => {
      const victim = await makePasswordUser("victim@example.com");

      await expect(
        googleReturns(
          sessionTokenOf(victim.id, "sid-victim"),
          "g-attacker",
          "attacker@example.com",
        ),
      ).rejects.toMatchObject({
        name: "LinkNotConfirmedError",
        reason: "no_grant",
      });

      await expect(googleAccountIdsOf(victim.id)).resolves.toEqual([]);
      await expect(gateEventsOf(victim.id)).resolves.toEqual([
        REFUSED_WITHOUT_GRANT,
      ]);
      // Auth.js created no user for the Google address either.
      await expect(prisma.user.count()).resolves.toBe(1);
    });

    it("an account that signs in with Google only cannot link a second Google account", async () => {
      const user = await makeGoogleOnlyUser("google-only@example.com", "g-own");

      await expect(
        googleReturns(
          sessionTokenOf(user.id, "sid-google-only"),
          "g-second",
          "second@example.com",
        ),
      ).rejects.toMatchObject({
        name: "LinkNotConfirmedError",
        reason: "no_grant",
      });

      await expect(googleAccountIdsOf(user.id)).resolves.toEqual(["g-own"]);
    });

    it("a session that was signed out is no session: a new user is created and nothing is linked to the old one", async () => {
      const signedOut = await makePasswordUser("signed-out@example.com");
      await prisma.revokedSession.create({
        data: { sid: "sid-ended", expires: new Date(Date.now() + 60_000) },
      });

      const result = await googleReturns(
        sessionTokenOf(signedOut.id, "sid-ended"),
        "g-unknown",
        "unknown@example.com",
      );

      expect(result.isNewUser).toBe(true);
      expect(result.user.id).not.toBe(signedOut.id);
      await expect(googleAccountIdsOf(signedOut.id)).resolves.toEqual([]);
      await expect(googleAccountIdsOf(result.user.id)).resolves.toEqual([
        "g-unknown",
      ]);
      await expect(gateEventsOf(signedOut.id)).resolves.toEqual([]);
    });

    // The application does not set allowDangerousEmailAccountLinking. With
    // it, Auth.js links a Google account to the user that has the same e-mail
    // address, without a session (handle-login.js:236-240, :264): no password
    // step comes before that link.
    it.each(notAFirstSignIn)(
      "with allowDangerousEmailAccountLinking, a visitor without a session is not linked to the user of the same e-mail address when that user %s",
      async (_, make) => {
        const user = await make("same-address@example.com");
        const accountsBefore = await prisma.account.count();

        await expect(
          googleReturns(
            undefined,
            "g-same-address",
            "same-address@example.com",
            authJsOptions({ allowDangerousEmailAccountLinking: true }),
          ),
        ).rejects.toMatchObject({
          name: "LinkNotConfirmedError",
          reason: "no_grant",
        });

        await expect(prisma.account.count()).resolves.toBe(accountsBefore);
        await expect(gateEventsOf(user.id)).resolves.toEqual([
          REFUSED_WITHOUT_GRANT,
        ]);
      },
    );

    it("a row without a password, an Account row and a verified e-mail blocks its address for Google, and with allowDangerousEmailAccountLinking it is linked without a grant", async () => {
      // The row of a first sign-in whose link was never written.
      const row = await prisma.user.create({
        data: { email: "left-behind@example.com" },
      });

      await expect(
        googleReturns(undefined, "g-left-behind", "left-behind@example.com"),
      ).rejects.toMatchObject({ type: "OAuthAccountNotLinked" });
      await expect(googleAccountIdsOf(row.id)).resolves.toEqual([]);

      const result = await googleReturns(
        undefined,
        "g-left-behind",
        "left-behind@example.com",
        authJsOptions({ allowDangerousEmailAccountLinking: true }),
      );

      // The gate takes the row for the one Auth.js has just created.
      expect(result).toMatchObject({ user: { id: row.id }, isNewUser: false });
      await expect(googleAccountIdsOf(row.id)).resolves.toEqual([
        "g-left-behind",
      ]);
      await expect(gateEventsOf(row.id)).resolves.toEqual([]);
      await expect(prisma.user.count()).resolves.toBe(1);
    });

    it("a first Google sign-in whose new row is changed before Auth.js links it is refused, and the row that is left behind blocks that address", async () => {
      // An event of one's own that marks the new user verified. Auth.js
      // calls it between createUser and linkAccount (handle-login.js:260-264).
      const markVerified = authJsOptions({
        createUser: async ({ user }) => {
          await prisma.user.update({
            where: { id: user.id },
            data: { emailVerified: new Date() },
          });
        },
      });

      await expect(
        googleReturns(
          undefined,
          "g-new",
          "new-visitor@example.com",
          markVerified,
        ),
      ).rejects.toMatchObject({
        name: "LinkNotConfirmedError",
        reason: "no_grant",
      });

      const row = await prisma.user.findUniqueOrThrow({
        where: { email: "new-visitor@example.com" },
      });
      await expect(googleAccountIdsOf(row.id)).resolves.toEqual([]);
      // The next attempt, without that event: Auth.js finds the row by its
      // e-mail address and refuses, before the gate.
      await expect(
        googleReturns(undefined, "g-new", "new-visitor@example.com"),
      ).rejects.toMatchObject({ type: "OAuthAccountNotLinked" });
      await expect(prisma.user.count()).resolves.toBe(1);
      await expect(prisma.account.count()).resolves.toBe(0);
    });
  });
});
