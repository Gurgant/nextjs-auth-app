/**
 * @jest-environment node
 *
 * Which database the integration test connects to (src/lib/prisma-test.ts),
 * and the hybrid test in real mode. They delete every row of the tables they
 * use, so the rule is a safety device: DATABASE_URL is used only when it
 * carries the mark of a test database, and when it is set aside the module
 * says so. The Prisma client is replaced by a mock: nothing here connects to
 * a database.
 */
import type * as PrismaTest from "@/lib/prisma-test";

const mockPrismaClient = jest.fn();
jest.mock("@/lib/types/prisma", () => ({
  PrismaClient: function (options: unknown) {
    mockPrismaClient(options);
    return { $disconnect: jest.fn() };
  },
}));

const CREDENTIALS = "app_user:Sup3r-Secret-7731";
const DOCKER_TEST_DATABASE =
  "postgresql://postgres:postgres123@127.0.0.1:5433/nextjs_auth_db";
// The DATABASE_URL of .env.example: the development database.
const DEVELOPMENT_DATABASE =
  "postgresql://postgres:postgres123@127.0.0.1:5432/nextjs_auth_db";

/** The module as a test file gets it when DATABASE_URL is `databaseUrl`. */
function loadWith(databaseUrl: string | undefined): typeof PrismaTest {
  if (databaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = databaseUrl;
  }
  let loaded: typeof PrismaTest | undefined;
  jest.isolateModules(() => {
    loaded = require("@/lib/prisma-test");
  });
  return loaded!;
}

/** The connection URL that the one client of the module was created with. */
function clientUrl(): string {
  expect(mockPrismaClient).toHaveBeenCalledTimes(1);
  return mockPrismaClient.mock.calls[0][0].datasources.db.url;
}

describe("the database of the integration test", () => {
  const previousUrl = process.env.DATABASE_URL;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    // The module asks to be told when the process ends: not in this worker.
    jest.spyOn(process, "on").mockImplementation(() => process);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (previousUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousUrl;
    }
  });

  describe("a DATABASE_URL with the mark of a test database is used as it is", () => {
    it.each([
      ["the docker test database", DOCKER_TEST_DATABASE],
      [
        "a test database moved to port 15433",
        "postgresql://postgres:postgres123@127.0.0.1:15433/nextjs_auth_db",
      ],
    ])("%s", (_name, url) => {
      const { resolveTestDatabase } = loadWith(url);

      expect(resolveTestDatabase(url)).toEqual({ url });
      expect(clientUrl().startsWith(`${url}?`)).toBe(true);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe("without a DATABASE_URL the docker test database is used, and nothing was set aside", () => {
    it.each([
      ["unset", undefined],
      ["empty", ""],
    ])("%s", (_name, url) => {
      const { resolveTestDatabase } = loadWith(url);

      expect(resolveTestDatabase(url)).toEqual({ url: DOCKER_TEST_DATABASE });
      expect(clientUrl().startsWith(`${DOCKER_TEST_DATABASE}?`)).toBe(true);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe("a DATABASE_URL without the mark is never used, and the module says which database is", () => {
    it.each([
      [
        "the development database of .env.example",
        DEVELOPMENT_DATABASE,
        "127.0.0.1:5432/nextjs_auth_db",
      ],
      [
        "a database on the default port, with options",
        `postgresql://${CREDENTIALS}@db.internal/shop?schema=public&sslmode=require`,
        "db.internal:5432/shop",
      ],
      [
        "a database on another port",
        `postgresql://${CREDENTIALS}@db.internal:6543/shop`,
        "db.internal:6543/shop",
      ],
      [
        "a text that is no URL",
        "Sup3r-Secret-7731",
        "a text that is not a connection URL",
      ],
    ])("%s", (_name, url, named) => {
      const { resolveTestDatabase } = loadWith(url);

      const { url: used, notice } = resolveTestDatabase(url);
      expect(used).toBe(DOCKER_TEST_DATABASE);
      expect(notice).toContain(`DATABASE_URL (${named}) is NOT used`);
      expect(notice).toContain(
        "They connect to 127.0.0.1:5433/nextjs_auth_db instead",
      );
      // What is printed names databases, not accounts.
      expect(notice).not.toContain("Sup3r-Secret-7731");
      expect(notice).not.toContain("app_user");
      expect(notice).not.toContain("postgres123");

      // The client of the module follows the rule, and the notice is printed.
      expect(clientUrl().startsWith(`${DOCKER_TEST_DATABASE}?`)).toBe(true);
      expect(warn.mock.calls).toEqual([[notice]]);
    });
  });

  it("prints the whole rule when it sets a DATABASE_URL aside", () => {
    const { resolveTestDatabase } = loadWith(undefined);

    expect(resolveTestDatabase(DEVELOPMENT_DATABASE).notice).toBe(
      "[prisma-test] DATABASE_URL (127.0.0.1:5432/nextjs_auth_db) is NOT " +
        'used: it does not contain "5433", the mark of a test database. The ' +
        "tests that use this client delete every row of the tables they " +
        "touch. They connect to 127.0.0.1:5433/nextjs_auth_db instead, the " +
        "docker test database. To run them against another test database, " +
        'pass a DATABASE_URL that contains "5433" (docs/TESTING.md).',
    );
  });

  it("hands out one client", () => {
    const { getPrismaTestClient, prismaTest } = loadWith(DOCKER_TEST_DATABASE);

    expect(getPrismaTestClient()).toBe(prismaTest);
    expect(mockPrismaClient).toHaveBeenCalledTimes(1);
  });

  describe("the second client, for a test that holds a row lock", () => {
    it.each([
      [
        "a test database moved to port 15433",
        "postgresql://postgres:postgres123@127.0.0.1:15433/nextjs_auth_db",
        "postgresql://postgres:postgres123@127.0.0.1:15433/nextjs_auth_db",
      ],
      ["no DATABASE_URL", undefined, DOCKER_TEST_DATABASE],
      // The safety rule holds for it too: never the database that was set aside.
      [
        "the development database of .env.example",
        DEVELOPMENT_DATABASE,
        DOCKER_TEST_DATABASE,
      ],
    ])(
      "connects to the database of the shared client: %s",
      (_name, url, used) => {
        const { openSecondPrismaTestClient, prismaTest } = loadWith(url);

        const second = openSecondPrismaTestClient();

        // A client of its own, and with it a connection pool of its own.
        expect(second).not.toBe(prismaTest);
        expect(mockPrismaClient).toHaveBeenCalledTimes(2);
        const [shared, own] = mockPrismaClient.mock.calls.map(
          ([options]) => options.datasources.db.url,
        );
        expect(shared.startsWith(`${used}?`)).toBe(true);
        expect(own).toBe(used);
      },
    );
  });
});
