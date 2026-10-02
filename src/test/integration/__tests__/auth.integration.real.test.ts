/**
 * Integration tests with REAL PostgreSQL database
 * Requires Docker database to be running
 * Run with: pnpm run test:integration
 */

import { prismaTest as prisma, cleanupPrismaTest } from "@/lib/prisma-test";
import { RegisterUserCommand } from "@/lib/commands/auth/register-user.command";
import { ChangePasswordCommand } from "@/lib/commands/auth/change-password.command";
import { UserRepository } from "@/lib/repositories/user/user.repository";
import {
  revokeSession,
  verifySessionToken,
} from "@/lib/auth/session-revocation";
import { UserBuilder } from "../../builders/user.builder";
import { AccountBuilder } from "../../builders/account.builder";
import { SessionBuilder } from "../../builders/session.builder";
import bcrypt from "bcryptjs";
import type { JWT } from "next-auth/jwt";

// Using properly configured test Prisma client
// Connection pooling is handled in prisma-test.ts

// The session guard uses the app's Prisma client: point it at the test database.
jest.mock("@/lib/prisma", () => ({
  prisma: require("@/lib/prisma-test").prismaTest,
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
      findByCredentials: async (email: string, password: string) => {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password) return null;
        const isValid = await bcrypt.compare(password, user.password);
        return isValid ? user : null;
      },
      create: async (data: {
        name?: string;
        email: string;
        password?: string;
        emailVerified?: Date | null;
      }) => {
        return prisma.user.create({ data });
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
      updateLastLogin: async (id: string) => {
        return prisma.user.update({
          where: { id },
          data: { lastLoginAt: new Date() },
        });
      },
      updatePassword: async (id: string, password: string) => {
        return prisma.user.update({
          where: { id },
          data: {
            password,
            lastPasswordChange: new Date(),
          },
        });
      },
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

  // Credentials login in production flows through NextAuth authorize()
  // (src/lib/auth-config.ts), whose data seam is UserRepository. These tests
  // exercise the REAL repository against the real database.
  describe("User Login - Real DB", () => {
    it("should verify valid credentials via the real UserRepository", async () => {
      // Arrange - Create user in database
      const password = "ValidPass123!";
      const hashedPassword = await bcrypt.hash(password, 4);

      const user = await prisma.user.create({
        data: {
          name: "Login Test User",
          email: "logintest@example.com",
          password: hashedPassword,
          emailVerified: new Date(),
        },
      });

      await prisma.account.create({
        data: {
          userId: user.id,
          provider: "credentials",
          providerAccountId: user.email,
          type: "credentials",
        },
      });

      const userRepo = new UserRepository(prisma);

      // Act - same calls authorize() makes on successful login
      const found = await userRepo.findByCredentials(
        "logintest@example.com",
        password,
      );
      expect(found?.id).toBe(user.id);
      await userRepo.updateLastLogin(user.id);

      // Assert - last login was updated in database
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.lastLoginAt).toBeTruthy();
    });

    it("should reject an invalid password via the real UserRepository", async () => {
      // Arrange
      const user = await prisma.user.create({
        data: {
          name: "Invalid Pass User",
          email: "invalidpass@example.com",
          password: await bcrypt.hash("Correct123!", 4),
        },
      });

      const userRepo = new UserRepository(prisma);

      // Act
      const found = await userRepo.findByCredentials(
        "invalidpass@example.com",
        "Wrong123!",
      );

      // Assert
      expect(found).toBeNull();

      // Verify lastLoginAt was NOT updated
      const unchangedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(unchangedUser?.lastLoginAt).toBeNull();
    });

    it("should reject a non-existent user via the real UserRepository", async () => {
      const userRepo = new UserRepository(prisma);
      const found = await userRepo.findByCredentials(
        "ghost@example.com",
        "Whatever123!",
      );
      expect(found).toBeNull();
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

  describe("Database Query Performance - Real DB", () => {
    it("should handle bulk operations efficiently", async () => {
      // Arrange - Create many users
      const startTime = Date.now();

      const users = Array.from({ length: 100 }, (_, i) => ({
        name: `Bulk User ${i}`,
        email: `bulk${i}@example.com`,
        password: bcrypt.hashSync("Test123!", 4),
      }));

      // Act
      await prisma.user.createMany({ data: users });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Assert
      console.log(`Created 100 users in ${duration}ms`);
      expect(duration).toBeLessThan(15000); // Should complete within reasonable time

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

    it("updatePassword() without the option leaves the session version alone", async () => {
      const user = await makeUser("add-password@example.com");
      const hash = await bcrypt.hash("Another123!", 4);

      await new UserRepository(prisma).updatePassword(user.id, hash);

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
});
