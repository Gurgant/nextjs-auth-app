/**
 * Integration tests with REAL PostgreSQL database
 * Requires Docker database to be running
 * Run with: pnpm run test:integration
 */

import { prismaTest as prisma, cleanupPrismaTest } from "@/lib/prisma-test";
import { RegisterUserCommand } from "@/lib/commands/auth/register-user.command";
import { LoginUserCommand } from "@/lib/commands/auth/login-user.command";
import { ChangePasswordCommand } from "@/lib/commands/auth/change-password.command";
import { UserBuilder } from "../../builders/user.builder";
import { AccountBuilder } from "../../builders/account.builder";
import { SessionBuilder } from "../../builders/session.builder";
import bcrypt from "bcryptjs";

// Using properly configured test Prisma client
// Connection pooling is handled in prisma-test.ts

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
      create: async (data: any) => {
        return prisma.user.create({ data });
      },
      createWithAccount: async (data: any) => {
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
      update: async (id: string, data: any) => {
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

  describe("User Login - Real DB", () => {
    it("should login with valid credentials from real database", async () => {
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

      const command = new LoginUserCommand();

      // Act
      const result = await command.execute({
        email: "logintest@example.com",
        password: password,
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.userId).toBe(user.id);
      }

      // Verify last login was updated in database
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.lastLoginAt).toBeTruthy();
    });

    it("should reject invalid password from real database", async () => {
      // Arrange
      const user = await prisma.user.create({
        data: {
          name: "Invalid Pass User",
          email: "invalidpass@example.com",
          password: await bcrypt.hash("Correct123!", 4),
        },
      });

      const command = new LoginUserCommand();

      // Act
      const result = await command.execute({
        email: "invalidpass@example.com",
        password: "Wrong123!",
      });

      // Assert
      expect(result.success).toBe(false);

      // Verify lastLoginAt was NOT updated
      const unchangedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(unchangedUser?.lastLoginAt).toBeNull();
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
});
