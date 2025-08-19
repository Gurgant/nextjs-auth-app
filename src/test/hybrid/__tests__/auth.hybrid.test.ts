/**
 * Hybrid tests that can run with either mock or real database
 * Set TEST_MODE=mock for mocked tests (fast, no DB needed)
 * Set TEST_MODE=real for real database tests
 * Default: mock
 */

// Only import PrismaClient if we're in real mode
const PrismaClient =
  process.env.TEST_MODE === "real"
    ? require("@/generated/prisma").PrismaClient
    : null;
import { RegisterUserCommand } from "@/lib/commands/auth/register-user.command";
import { LoginUserCommand } from "@/lib/commands/auth/login-user.command";
import { mockPrismaClient, resetPrismaMocks } from "../../mocks/prisma.mock";
import { UserBuilder } from "../../builders/user.builder";
import bcrypt from "bcryptjs";

// Determine test mode from environment
const TEST_MODE = process.env.TEST_MODE || "mock";
const IS_REAL_DB = TEST_MODE === "real";

console.log(`🔧 Running in ${TEST_MODE} mode`);

// Create appropriate database client
const realPrisma = IS_REAL_DB
  ? new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL ||
            "postgresql://postgres:postgres123@localhost:5433/nextjs_auth_db",
        },
      },
    })
  : null;

// Use real or mock Prisma based on mode
const prisma = IS_REAL_DB ? realPrisma : mockPrismaClient;

// Database helper functions that work for both modes
const dbHelpers = {
  async connect() {
    if (IS_REAL_DB && realPrisma) {
      await realPrisma.$connect();
      console.log("✅ Connected to real database");
    } else {
      console.log("✅ Using mock database");
    }
  },

  async disconnect() {
    if (IS_REAL_DB && realPrisma) {
      await realPrisma.$disconnect();
      console.log("✅ Disconnected from real database");
    }
  },

  async clear() {
    if (IS_REAL_DB && realPrisma) {
      await realPrisma.$transaction([
        realPrisma.account.deleteMany(),
        realPrisma.session.deleteMany(),
        realPrisma.verificationToken.deleteMany(),
        realPrisma.user.deleteMany(),
      ]);
      console.log("🧹 Cleaned real database");
    } else {
      resetPrismaMocks();
      dbHelpers._mockUsers = [];
      console.log("🧹 Reset mock database");
    }
  },

  async createUser(data: any) {
    if (IS_REAL_DB && realPrisma) {
      return realPrisma.user.create({ data });
    } else {
      const user = new UserBuilder().withMany(data).build();
      // Track the user creation in mock
      if (!dbHelpers._mockUsers) {
        dbHelpers._mockUsers = [];
      }
      dbHelpers._mockUsers.push(user);
      mockPrismaClient.user.create.mockResolvedValue(user);
      mockPrismaClient.user.findUnique.mockImplementation((args: any) => {
        if (args.where?.email === data.email || args.where?.id === user.id) {
          return Promise.resolve(user);
        }
        return Promise.resolve(null);
      });
      return user;
    }
  },

  async findUser(where: { email?: string; id?: string }) {
    if (IS_REAL_DB && realPrisma) {
      return realPrisma.user.findUnique({ where });
    } else {
      return mockPrismaClient.user.findUnique({ where });
    }
  },

  async createAccount(data: any) {
    if (IS_REAL_DB && realPrisma) {
      return realPrisma.account.create({ data });
    } else {
      const account = { id: "mock-account-id", ...data };
      mockPrismaClient.account.create.mockResolvedValue(account);
      return account;
    }
  },

  async countUsers() {
    if (IS_REAL_DB && realPrisma) {
      return realPrisma.user.count();
    } else {
      return dbHelpers._mockUsers ? dbHelpers._mockUsers.length : 0;
    }
  },

  _mockUsers: [] as any[],
};

// Mock the repositories to use our hybrid prisma
jest.mock("@/lib/repositories", () => ({
  repositories: {
    getUserRepository: () => ({
      findByEmail: async (email: string) => {
        return dbHelpers.findUser({ email });
      },
      findById: async (id: string) => {
        return dbHelpers.findUser({ id });
      },
      findByCredentials: async (email: string, password: string) => {
        const user = await dbHelpers.findUser({ email });
        if (!user || !user.password) return null;
        const isValid = await bcrypt.compare(password, user.password);
        return isValid ? user : null;
      },
      createWithAccount: async (data: any) => {
        const user = await dbHelpers.createUser({
          name: data.name,
          email: data.email,
          password: data.password,
        });
        await dbHelpers.createAccount({
          userId: user.id,
          provider: data.provider,
          providerAccountId: data.providerAccountId,
          type: "credentials",
        });
        return user;
      },
      update: async (id: string, data: any) => {
        if (IS_REAL_DB && realPrisma) {
          return realPrisma.user.update({ where: { id }, data });
        } else {
          const updatedUser = { id, ...data };
          mockPrismaClient.user.update.mockResolvedValue(updatedUser);
          return updatedUser;
        }
      },
      updateLastLogin: async (id: string) => {
        if (IS_REAL_DB && realPrisma) {
          return realPrisma.user.update({
            where: { id },
            data: { lastLoginAt: new Date() },
          });
        } else {
          const user = await dbHelpers.findUser({ id });
          const updated = { ...user, lastLoginAt: new Date() };
          mockPrismaClient.user.update.mockResolvedValue(updated);
          return updated;
        }
      },
      updatePassword: async (id: string, password: string) => {
        if (IS_REAL_DB && realPrisma) {
          return realPrisma.user.update({
            where: { id },
            data: { password, lastPasswordChange: new Date() },
          });
        } else {
          const updated = { id, password, lastPasswordChange: new Date() };
          mockPrismaClient.user.update.mockResolvedValue(updated);
          return updated;
        }
      },
      delete: async (id: string) => {
        if (IS_REAL_DB && realPrisma) {
          await realPrisma.$transaction([
            realPrisma.account.deleteMany({ where: { userId: id } }),
            realPrisma.session.deleteMany({ where: { userId: id } }),
            realPrisma.user.delete({ where: { id } }),
          ]);
        } else {
          mockPrismaClient.user.delete.mockResolvedValue({ id });
        }
        return true;
      },
    }),
  },
}));

describe(`Hybrid Authentication Tests (${TEST_MODE} mode)`, () => {
  beforeAll(async () => {
    await dbHelpers.connect();
  });

  afterAll(async () => {
    await dbHelpers.disconnect();
  });

  beforeEach(async () => {
    await dbHelpers.clear();

    // Setup mocks if in mock mode
    if (!IS_REAL_DB) {
      // Mock that no users exist initially
      mockPrismaClient.user.findUnique.mockResolvedValue(null);
      mockPrismaClient.user.create.mockImplementation((args: any) => {
        const user = new UserBuilder()
          .withEmail(args.data.email)
          .withName(args.data.name)
          .build();
        user.password = args.data.password;
        return Promise.resolve(user);
      });
    }
  });

  describe("User Registration", () => {
    it("should register a new user successfully", async () => {
      // This test works the same way for both mock and real DB
      const registrationData = {
        name: "Hybrid Test User",
        email: "hybrid@example.com",
        password: "HybridPass123!",
        confirmPassword: "HybridPass123!",
      };

      const command = new RegisterUserCommand();
      const result = await command.execute(registrationData);

      expect(result.success).toBe(true);

      // Verify user was created
      const user = await dbHelpers.findUser({ email: registrationData.email });
      expect(user).toBeTruthy();
      expect(user?.name).toBe(registrationData.name);
    });

    it("should prevent duplicate email registration", async () => {
      // Create existing user
      await dbHelpers.createUser({
        name: "Existing User",
        email: "existing@example.com",
        password: await bcrypt.hash("Test123!", 4),
      });

      const command = new RegisterUserCommand();
      const result = await command.execute({
        name: "Another User",
        email: "existing@example.com",
        password: "Test123!",
        confirmPassword: "Test123!",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("User Login", () => {
    it("should login with valid credentials", async () => {
      // Setup user
      const password = "ValidPass123!";
      const hashedPassword = await bcrypt.hash(password, 4);

      const user = await dbHelpers.createUser({
        name: "Login Test",
        email: "login@example.com",
        password: hashedPassword,
        emailVerified: new Date(),
      });

      const command = new LoginUserCommand();
      const result = await command.execute({
        email: "login@example.com",
        password: password,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.userId).toBe(user.id);
      }
    });

    it("should reject invalid credentials", async () => {
      const user = await dbHelpers.createUser({
        name: "Invalid Test",
        email: "invalid@example.com",
        password: await bcrypt.hash("Correct123!", 4),
      });

      const command = new LoginUserCommand();
      const result = await command.execute({
        email: "invalid@example.com",
        password: "Wrong123!",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("Performance Comparison", () => {
    it("should show performance difference between modes", async () => {
      const iterations = 10;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await dbHelpers.createUser({
          name: `Perf User ${i}`,
          email: `perf${i}@example.com`,
          password: await bcrypt.hash("Test123!", 4),
        });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;
      const avgTime = duration / iterations;

      console.log(`
        📊 Performance Results (${TEST_MODE} mode):
        - Total time: ${duration}ms
        - Average per operation: ${avgTime.toFixed(2)}ms
        - Operations: ${iterations} user creations
      `);

      // Mock should be faster than real DB, but bcrypt hashing still takes time
      if (IS_REAL_DB) {
        expect(avgTime).toBeLessThan(500); // Real DB operations
      } else {
        expect(avgTime).toBeLessThan(400); // Mock operations with bcrypt overhead
      }

      // Verify all users were created
      const count = await dbHelpers.countUsers();
      expect(count).toBe(iterations);
    }, 30000); // 30 second timeout for performance test with bcrypt
  });

  describe("Mode-Specific Features", () => {
    if (IS_REAL_DB) {
      it("[REAL DB ONLY] should handle database constraints", async () => {
        // This test only runs in real DB mode
        const user = await dbHelpers.createUser({
          name: "Constraint Test",
          email: "constraint@example.com",
          password: await bcrypt.hash("Test123!", 4),
        });

        // Try to create duplicate (should fail with real constraint)
        try {
          await realPrisma!.user.create({
            data: {
              name: "Duplicate",
              email: "constraint@example.com", // Same email
              password: "whatever",
            },
          });
          fail("Should have thrown unique constraint error");
        } catch (error: any) {
          expect(error.code).toBe("P2002"); // Prisma unique constraint error
        }
      });
    } else {
      it("[MOCK ONLY] should allow instant test data setup", () => {
        // This test only runs in mock mode
        // Instantly setup complex scenarios without database overhead
        const users = Array.from({ length: 1000 }, (_, i) => ({
          id: `user-${i}`,
          email: `mock${i}@example.com`,
        }));

        mockPrismaClient.user.findMany.mockResolvedValue(users as any);

        // This would be very slow with real DB but instant with mocks
        expect(mockPrismaClient.user.findMany()).resolves.toHaveLength(1000);
      });
    }
  });
});

// Export test utilities for other tests to use
export { dbHelpers, TEST_MODE, IS_REAL_DB };
