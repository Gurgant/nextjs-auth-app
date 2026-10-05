/**
 * Prisma Client for Testing
 * Properly configured with connection pooling for tests
 *
 * Which database it connects to is a safety device: the tests that use it
 * delete every row of the tables they touch. DATABASE_URL is used only when
 * it carries the mark of a test database. Any other DATABASE_URL is set
 * aside for the docker test database, and the module says so: under Jest the
 * variable is usually the development database of .env, which next/jest
 * loads when the shell names none (`pnpm test`, `pnpm test:coverage`).
 */

import { PrismaClient } from "@/lib/types/prisma";

// The docker test database (docker-compose.yml). CI and the scripts
// test:integration and test:hybrid:real name the same one.
const DOCKER_TEST_DATABASE_URL =
  "postgresql://postgres:postgres123@127.0.0.1:5433/nextjs_auth_db";

// The host port of the docker test database. It stays in the URL when the
// database is moved to another port, such as 15433
// (docs/setup/DATABASE_SETUP_GUIDE.md).
const TEST_DATABASE_MARK = "5433";

/** host:port/database of a connection URL: what may be printed of it. */
function databaseOf(url: string): string {
  try {
    const { hostname, port, pathname } = new URL(url);
    return `${hostname}:${port || "5432"}${pathname}`;
  } catch {
    return "a text that is not a connection URL";
  }
}

/**
 * The database the tests connect to. `notice` is set when `databaseUrl` names
 * another one: it says which database is not used and which one is.
 */
export function resolveTestDatabase(databaseUrl: string | undefined): {
  url: string;
  notice?: string;
} {
  if (!databaseUrl) return { url: DOCKER_TEST_DATABASE_URL };
  if (databaseUrl.includes(TEST_DATABASE_MARK)) return { url: databaseUrl };

  const used = databaseOf(DOCKER_TEST_DATABASE_URL);
  return {
    url: DOCKER_TEST_DATABASE_URL,
    notice:
      `[prisma-test] DATABASE_URL (${databaseOf(databaseUrl)}) is NOT used: ` +
      `it does not contain "${TEST_DATABASE_MARK}", the mark of a test ` +
      "database. The tests that use this client delete every row of the " +
      `tables they touch. They connect to ${used} instead, the docker test ` +
      "database. To run them against another test database, pass a " +
      `DATABASE_URL that contains "${TEST_DATABASE_MARK}" (docs/TESTING.md).`,
  };
}

const testDatabase = resolveTestDatabase(process.env.DATABASE_URL);
if (testDatabase.notice) console.warn(testDatabase.notice);

// Configure connection pool for tests
const connectionLimit = process.env.CI ? 2 : 5; // Fewer connections in CI

// Create a singleton instance for tests
let prismaTestInstance: PrismaClient | null = null;

export function getPrismaTestClient(): PrismaClient {
  if (!prismaTestInstance) {
    prismaTestInstance = new PrismaClient({
      datasources: {
        db: {
          url: `${testDatabase.url}?connection_limit=${connectionLimit}&pool_timeout=10`,
        },
      },
      log:
        process.env.DEBUG === "true" ? ["query", "error", "warn"] : ["error"],
    });
  }
  return prismaTestInstance;
}

// Export the singleton instance
export const prismaTest = getPrismaTestClient();

/**
 * A second client on the same test database, with a connection pool of its
 * own: for a test that holds a row lock while calls on the shared client wait
 * for it. It follows the rule of the shared client: the database is the one
 * resolveTestDatabase chose, never a DATABASE_URL that was set aside. The
 * caller disconnects it.
 */
export function openSecondPrismaTestClient(): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: testDatabase.url } },
    log: ["error"],
  });
}

// Cleanup function to properly disconnect
export async function cleanupPrismaTest() {
  if (prismaTestInstance) {
    await prismaTestInstance.$disconnect();
    prismaTestInstance = null;
  }
}

// Ensure connections are cleaned up on process exit
process.on("beforeExit", async () => {
  await cleanupPrismaTest();
});

// Handle unexpected shutdowns
process.on("SIGINT", async () => {
  await cleanupPrismaTest();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await cleanupPrismaTest();
  process.exit(0);
});
