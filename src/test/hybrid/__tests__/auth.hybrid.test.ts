/**
 * Hybrid tests that can run with either mock or real database
 * Set TEST_MODE=mock for mocked tests (fast, no DB needed)
 * Set TEST_MODE=real for real database tests
 * Default: mock
 *
 * `pnpm test` and `pnpm test:unit` run this file in mock mode. Real mode is
 * started by hand only (`pnpm test:hybrid:real`, or `pnpm test:all:real`):
 * no job of the CI workflow runs it.
 */

import { RegisterUserCommand } from "@/lib/commands/auth/register-user.command";
import { mockPrismaClient, resetPrismaMocks } from "../../mocks/prisma.mock";
import { UserBuilder } from "../../builders/user.builder";
import bcrypt from "bcryptjs";

// Determine test mode from environment
const TEST_MODE = process.env.TEST_MODE || "mock";
const IS_REAL_DB = TEST_MODE === "real";

console.log(`🔧 Running in ${TEST_MODE} mode`);

// In real mode the client is the one of the integration test, loaded only
// then. Its rule decides which database this file may clear: a DATABASE_URL
// that is not a test database is not used (src/lib/prisma-test.ts).
const realPrisma = IS_REAL_DB ? require("@/lib/prisma-test").prismaTest : null;

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
      console.log("🧹 Reset mock database");
    }
  },

  async createUser(data: any) {
    if (IS_REAL_DB && realPrisma) {
      return realPrisma.user.create({ data });
    } else {
      const user = new UserBuilder().withMany(data).build();
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
      updatePassword: async (
        id: string,
        password: string,
        options: { revokeSessions: boolean },
      ) => {
        if (IS_REAL_DB && realPrisma) {
          return realPrisma.user.update({
            where: { id },
            data: {
              password,
              lastPasswordChange: new Date(),
              ...(options.revokeSessions
                ? { sessionVersion: { increment: 1 } }
                : {}),
            },
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

  // Two tests of this group are gone. "[REAL DB ONLY] should store every user
  // it creates" inserted ten rows through Prisma and counted them: it called
  // no code of the application. "[MOCK ONLY] should allow instant test data
  // setup" set the answer of a mock and asserted that answer, in an
  // `expect(...).resolves` that was neither awaited nor returned: the test
  // had ended before the assertion was made. Measured with the expected
  // length made wrong and the file run alone: no test was reported as
  // failed, and the unhandled rejection ended the Jest process instead.
  // What is left has no counterpart in mock mode: a mock has no constraints.
  if (IS_REAL_DB) {
    describe("Mode-Specific Features", () => {
      // The unique index on User.email, in the database as the schema was
      // pushed to it. Registration looks the address up and creates the user
      // in two steps (register-user.command.ts), so between two registrations
      // that overlap this index is what is left to refuse the second (read
      // in the code, not measured).
      it("[REAL DB ONLY] should handle database constraints", async () => {
        await dbHelpers.createUser({
          name: "Constraint Test",
          email: "constraint@example.com",
          password: await bcrypt.hash("Test123!", 4),
        });

        await expect(
          realPrisma.user.create({
            data: {
              name: "Duplicate",
              email: "constraint@example.com", // Same email
              password: "whatever",
            },
          }),
        ).rejects.toMatchObject({ code: "P2002" }); // Prisma unique constraint error
        await expect(
          realPrisma.user.count({ where: { email: "constraint@example.com" } }),
        ).resolves.toBe(1);
      });
    });
  }
});
