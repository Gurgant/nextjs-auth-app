/**
 * @jest-environment node
 *
 * verifyEmailToken verifies an address once and uses a link up once, in
 * whatever order the requests come: the same link again, a second link of the
 * same user, and two requests that arrive together. Only the request that
 * verifies writes the user row and records an event; every other one answers
 * that the address is already verified.
 * The Prisma client is a stand-in that keeps one user row and its token rows
 * in memory. It applies the `where` of a write to its rows as a database
 * does, and runs one transaction after the other. That PostgreSQL makes the
 * second of two transactions that meet on a row wait, and then checks its
 * `where` again, is not shown by this file. The stand-in also has the two
 * writes without a condition (`update`), which the action does not use: an
 * action that went back to them would fail these tests by its answers. The
 * real logSecurityEvent writes the events, into the stand-in.
 */
// Translations answer with the English fallback the action passes in.
jest.mock("@/lib/utils/server-translations", () => ({
  translateError: async (_locale: string, key: string, fallback?: string) =>
    fallback ?? key,
  translateSuccess: async (_locale: string, key: string, fallback?: string) =>
    fallback ?? key,
}));

jest.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

jest.mock("@/lib/auth", () => ({
  auth: async () => null,
}));

jest.mock("@/lib/email", () => ({
  sendVerificationEmail: async () => true,
  sendSecurityAlert: async () => true,
}));

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const mockUser: Row = {};
const mockTokens: Row[] = [];
const mockEvents: Row[] = [];
let mockUserWrites = 0;
let mockLastTransaction: Promise<unknown> = Promise.resolve();

jest.mock("@/lib/prisma", () => {
  const matches = (row: Row, where: Where) =>
    Object.entries(where).every(([column, value]) => row[column] === value);
  const writeUser = (data: Row) => {
    Object.assign(mockUser, data, { updatedAt: new Date() });
    mockUserWrites += 1;
  };

  const client = {
    emailVerificationToken: {
      // A copy, as a query answers: a later write does not change it.
      findUnique: async ({ where }: { where: Where }) => {
        const row = mockTokens.find((token) => matches(token, where));
        return row
          ? { ...row, user: { emailVerified: mockUser.emailVerified } }
          : null;
      },
      update: async ({ where, data }: { where: Where; data: Row }) => {
        const row = mockTokens.find((token) => matches(token, where));
        if (!row) throw new Error("No token row to update");
        return Object.assign(row, data);
      },
      updateMany: async ({ where, data }: { where: Where; data: Row }) => {
        const rows = mockTokens.filter((token) => matches(token, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
    },
    user: {
      findUnique: async ({ where }: { where: Where }) =>
        matches(mockUser, where)
          ? { emailVerified: mockUser.emailVerified }
          : null,
      update: async ({ where, data }: { where: Where; data: Row }) => {
        if (!matches(mockUser, where)) throw new Error("No user row to update");
        writeUser(data);
        return { ...mockUser };
      },
      updateMany: async ({ where, data }: { where: Where; data: Row }) => {
        if (!matches(mockUser, where)) return { count: 0 };
        writeUser(data);
        return { count: 1 };
      },
    },
    securityEvent: {
      create: async ({ data }: { data: Row }) => {
        mockEvents.push(data);
        return { id: `event-${mockEvents.length}` };
      },
    },
    // Both forms of a Prisma transaction: a list of writes, or a function
    // that is handed a client.
    $transaction: (work: Promise<unknown>[] | ((tx: unknown) => unknown)) => {
      const run = mockLastTransaction.then(() =>
        typeof work === "function" ? work(client) : Promise.all(work),
      );
      mockLastTransaction = run.catch(() => undefined);
      return run;
    },
  };
  return { prisma: client };
});

import { verifyEmailToken } from "../advanced-auth";

const USER_ID = "user-123";
const CREATED_AT = new Date("2026-01-01T09:00:00Z");
const VERIFIED_NOW = {
  success: true,
  message: "Email verified successfully",
  data: { alreadyVerified: false },
};
const ALREADY_VERIFIED = {
  success: true,
  message: "Email is already verified",
  data: { alreadyVerified: true },
};

/** An unused link of the user, valid for another half hour. */
function link(token: string): string {
  mockTokens.push({
    id: `row-of-${token}`,
    token,
    userId: USER_ID,
    used: false,
    expires: new Date(Date.now() + 30 * 60 * 1000),
  });
  return token;
}

/** What the database holds about the user and the links. */
const inDatabase = () => ({
  verifiedAt: mockUser.emailVerified,
  userUpdatedAt: mockUser.updatedAt,
  userWrites: mockUserWrites,
  usedLinks: mockTokens.filter((token) => token.used).map(({ token }) => token),
  verifiedEvents: mockEvents.filter(
    ({ eventType }) => eventType === "email_verified",
  ).length,
});

beforeEach(() => {
  for (const column of Object.keys(mockUser)) delete mockUser[column];
  Object.assign(mockUser, {
    id: USER_ID,
    emailVerified: null,
    updatedAt: CREATED_AT,
  });
  mockTokens.length = 0;
  mockEvents.length = 0;
  mockUserWrites = 0;
  mockLastTransaction = Promise.resolve();
});

describe("verifyEmailToken: one verification, whatever arrives", () => {
  it("the first request of a link verifies the address, uses the link up and records one event", async () => {
    const first = link("link-1");

    await expect(verifyEmailToken(first, "en")).resolves.toEqual(VERIFIED_NOW);

    expect(inDatabase()).toEqual({
      verifiedAt: expect.any(Date),
      userUpdatedAt: expect.any(Date),
      userWrites: 1,
      usedLinks: ["link-1"],
      verifiedEvents: 1,
    });
    expect(mockUser.updatedAt).not.toBe(CREATED_AT);
  });

  it("the same link again: already verified, and nothing is written", async () => {
    const first = link("link-1");
    await verifyEmailToken(first, "en");
    const afterTheFirstRequest = inDatabase();

    await expect(verifyEmailToken(first, "en")).resolves.toEqual(
      ALREADY_VERIFIED,
    );

    expect(inDatabase()).toEqual(afterTheFirstRequest);
  });

  // Two e-mails were requested and both links are followed: the second one
  // is unused and has not expired, and its address is verified.
  it("a second link of the same user: already verified, the link is used up, the user row and the events stay as they were", async () => {
    const first = link("link-1");
    const second = link("link-2");
    await verifyEmailToken(first, "en");
    const afterTheFirstLink = inDatabase();

    await expect(verifyEmailToken(second, "en")).resolves.toEqual(
      ALREADY_VERIFIED,
    );

    expect(inDatabase()).toEqual({
      ...afterTheFirstLink,
      usedLinks: ["link-1", "link-2"],
    });

    // Asked again, the second link answers the same and writes nothing.
    await expect(verifyEmailToken(second, "en")).resolves.toEqual(
      ALREADY_VERIFIED,
    );
    expect(inDatabase()).toEqual({
      ...afterTheFirstLink,
      usedLinks: ["link-1", "link-2"],
    });
  });

  // The address of a Google sign-in is verified without a link and without
  // an event.
  it("an unused link of an address that was verified without a link: already verified, no event", async () => {
    const verifiedAt = new Date("2026-01-01T10:00:00Z");
    mockUser.emailVerified = verifiedAt;
    const only = link("link-1");

    await expect(verifyEmailToken(only, "en")).resolves.toEqual(
      ALREADY_VERIFIED,
    );

    expect(inDatabase()).toEqual({
      verifiedAt,
      userUpdatedAt: CREATED_AT,
      userWrites: 0,
      usedLinks: ["link-1"],
      verifiedEvents: 0,
    });
  });

  it("two requests of one link that arrive together: one verifies, the other finds the address verified", async () => {
    const first = link("link-1");

    const answers = await Promise.all([
      verifyEmailToken(first, "en"),
      verifyEmailToken(first, "en"),
    ]);

    expect(answers).toEqual([VERIFIED_NOW, ALREADY_VERIFIED]);
    expect(inDatabase()).toMatchObject({
      userWrites: 1,
      usedLinks: ["link-1"],
      verifiedEvents: 1,
    });
  });

  it("two links of one user that arrive together: one verifies, the other finds the address verified", async () => {
    const first = link("link-1");
    const second = link("link-2");

    const answers = await Promise.all([
      verifyEmailToken(first, "en"),
      verifyEmailToken(second, "en"),
    ]);

    expect(answers).toEqual([VERIFIED_NOW, ALREADY_VERIFIED]);
    expect(inDatabase()).toMatchObject({
      userWrites: 1,
      usedLinks: ["link-1", "link-2"],
      verifiedEvents: 1,
    });
  });
});
