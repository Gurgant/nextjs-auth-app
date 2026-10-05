/**
 * @jest-environment node
 */

/**
 * Contract of DELETE /api/auth/link-account/unlink: the account page unlinks
 * Google with it, after asking for the password
 * (src/components/account/oauth-account-linking.tsx). In the order the route
 * decides, each refusal with its `code`:
 *   no session / session without a user id  -> 401 authentication_required
 *   five wrong passwords within 15 minutes  -> 429 too_many_attempts
 *                                              + Retry-After
 *   body that is no JSON object, password
 *   or provider that is no string           -> 400 invalid_request
 *   password or provider missing            -> 400 missing_fields
 *   a provider other than "google"          -> 400 unsupported_provider
 *   user gone                               -> 404 user_not_found
 *   account without a password              -> 404 password_not_set
 *   wrong password                          -> 401 invalid_password, counted,
 *                                              and an "account_unlink_failed"
 *                                              event
 *   Google not linked, or no longer linked
 *   when the rows are deleted               -> 404 not_linked
 *   a failing database                      -> 500 internal_error
 *   correct password                        -> 200 { success, message,
 *                                              provider, unlinkedAt }
 * A refusal answers { error, code }: the English text, and the code that the
 * account page translates (src/lib/auth/link-account-errors.ts). With the
 * 200, in one transaction: every Google Account row of the user is deleted,
 * with one statement, the user row loses `hasGoogleAccount` (and
 * `lastLoginMethod` when Google was the last method used) and an
 * "account_unlinked" event is written that says how many rows went.
 *
 * A user can hold more than one Google Account row (SECURITY.md, "Not one
 * transaction"). The route used to delete one row per call and to clear the
 * flag at the first: a Google account was left that still signed in, while
 * the user row said there was none.
 *
 * Google is the only provider the route unlinks, and it says so before it
 * reads the user: the credentials Account row cannot be removed through it.
 * The user always keeps a sign-in method, the password that was just
 * checked: an account without one is answered 404 before anything is
 * unlinked. (The route used to hold a 400 "Cannot unlink the only
 * authentication method" for that; no request could get it.)
 *
 * The wrong passwords are counted per account and per client address (the
 * first entry of X-Forwarded-For), and in one count with those of the
 * initiate route (POST /api/auth/link-account/initiate): SECURITY.md, "Abuse
 * prevention". The events record that same address, not the header as it
 * came, and the User-Agent cut to 512 characters (requestMetadata in
 * src/lib/security.ts).
 *
 * Runs against the REAL next/server (the global next/server mock in
 * jest.setup.js has no NextResponse.json), the real rate limiter and the real
 * bcryptjs.
 */

jest.mock("next/server", () => jest.requireActual("next/server"));

// auth() is the only identity source the route consults.
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));

// Every model and every method exists on this Prisma client and is recorded,
// so a read or a write that the route is not expected to make shows up in
// `mockPrismaCalls` instead of going unnoticed. A transaction is recorded as
// "$transaction" and hands its callback a client of its own, whose calls are
// recorded as "tx.<model>.<method>". One write is modelled: account.deleteMany
// removes the rows of `mockAccountTable` that its `where` names and answers
// how many they were, as the database does.
jest.mock("@/lib/prisma", () => {
  const delegate = (model: string) =>
    new Proxy(
      {},
      {
        get: (_target, method) => (args: unknown) =>
          mockPrismaCall(`${model}.${String(method)}`, args),
      },
    );
  const client = (prefix: string): unknown =>
    new Proxy(
      {},
      {
        get: (_target, model) =>
          model === "$transaction"
            ? (run: (tx: unknown) => Promise<unknown>) => {
                mockPrismaCalls.push({ name: "$transaction", args: undefined });
                return run(client("tx."));
              }
            : delegate(`${prefix}${String(model)}`),
      },
    );
  return { prisma: client("") };
});

import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { __resetRateLimitStore, RATE_LIMITS } from "@/lib/rate-limit";
import { POST as initiate } from "../../initiate/route";
import * as route from "../route";

const { DELETE } = route;

const mockAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;

/** The calls the route made on the Prisma client, in order. */
const mockPrismaCalls: { name: string; args: unknown }[] = [];
/** What prisma.user.findUnique answers: a row, null, or an Error to throw. */
let mockUserRow: unknown = null;
/** The one call that fails, when a test names one. */
let mockFailingCall: string | null = null;
/** The Account table, as far as the route can delete from it. */
let mockAccountTable: Record<string, unknown>[] = [];

function mockPrismaCall(name: string, args: unknown): Promise<unknown> {
  mockPrismaCalls.push({ name, args });
  if (name === mockFailingCall) {
    return Promise.reject(new Error("write refused"));
  }
  if (name.endsWith("account.deleteMany")) {
    const { where } = args as { where: Record<string, unknown> };
    const named = (row: Record<string, unknown>) =>
      Object.entries(where).every(([column, value]) => row[column] === value);
    const count = mockAccountTable.filter(named).length;
    mockAccountTable = mockAccountTable.filter((row) => !named(row));
    return Promise.resolve({ count });
  }
  if (name !== "user.findUnique") return Promise.resolve({ id: "a-row" });
  return mockUserRow instanceof Error
    ? Promise.reject(mockUserRow)
    : Promise.resolve(mockUserRow);
}

const UNLINK_URL = "http://localhost:3000/api/auth/link-account/unlink";
const INITIATE_URL = "http://localhost:3000/api/auth/link-account/initiate";
const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";
const PASSWORD = "Correct-Horse-1";
// Cost 4, the lowest bcrypt has: the check under test is the comparison.
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const CLIENT_ADDRESS = "203.0.113.7";
const OTHER_ADDRESS = "192.0.2.200";
// A client behind a proxy. The throttle counts the first entry of this
// header, and the events record that entry.
const FORWARDED_FOR = `${CLIENT_ADDRESS}, 198.51.100.9`;
const REAL_IP = "192.0.2.44";
const USER_AGENT = "jest-route-test";

const CREDENTIALS_ACCOUNT = {
  id: "account-credentials-1",
  provider: "credentials",
  providerAccountId: "someone@example.com",
};
const GOOGLE_ACCOUNT = {
  id: "account-google-1",
  provider: "google",
  providerAccountId: "google-subject-1",
};
// A second Google account of the same user: two password steps whose Google
// steps returned together leave one (SECURITY.md, "Not one transaction").
const SECOND_GOOGLE_ACCOUNT = {
  id: "account-google-2",
  provider: "google",
  providerAccountId: "google-subject-2",
};
// Another user's Google account: no request of USER_ID may remove it.
const GOOGLE_ACCOUNT_OF_ANOTHER_USER = {
  id: "account-google-9",
  provider: "google",
  providerAccountId: "google-subject-9",
  userId: OTHER_USER_ID,
};

type RequestHeaders = Record<string, string>;

/** What a request carries unless a test sends other headers. */
const PROXIED: RequestHeaders = {
  "x-forwarded-for": FORWARDED_FOR,
  "user-agent": USER_AGENT,
};

const from = (address: string): RequestHeaders => ({
  "x-forwarded-for": address,
  "user-agent": USER_AGENT,
});

const session = (user: Record<string, unknown> = { id: USER_ID }) => ({
  user,
  expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
});

// Signed up with a password, Google linked later, last signed in with the
// password.
const userRow = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  email: "someone@example.com",
  password: PASSWORD_HASH,
  lastLoginMethod: "credentials",
  accounts: [CREDENTIALS_ACCOUNT, GOOGLE_ACCOUNT],
  ...overrides,
});

const jsonRequest = (
  url: string,
  method: string,
  body: unknown,
  headers: RequestHeaders,
) =>
  new NextRequest(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const del = (body: unknown, headers: RequestHeaders = PROXIED) =>
  DELETE(jsonRequest(UNLINK_URL, "DELETE", body, headers));

/** A request whose body is this text as it is, JSON or not. */
const delText = (body: string) =>
  DELETE(
    new NextRequest(UNLINK_URL, {
      method: "DELETE",
      headers: { "content-type": "application/json", ...PROXIED },
      body,
    }),
  );

const unlinkWith = (password: string, headers?: RequestHeaders) =>
  del({ password, provider: "google" }, headers);

/** The same password check at the initiate route, with the same headers. */
const initiateWith = (password: string) =>
  initiate(
    jsonRequest(
      INITIATE_URL,
      "POST",
      { password, provider: "google" },
      PROXIED,
    ),
  );

const prismaCallNames = () => mockPrismaCalls.map((call) => call.name);

/**
 * Gives the user these Account rows: in the row that the route reads, and in
 * the table it deletes from, which also holds another user's Google account.
 */
function giveTheUser(accounts: Record<string, unknown>[], id = USER_ID) {
  mockUserRow = userRow({ id, accounts });
  mockAccountTable = [
    ...accounts.map((account) => ({ ...account, userId: id })),
    GOOGLE_ACCOUNT_OF_ANOTHER_USER,
  ];
}

/** The ids of the Account rows that are left in the table. */
const accountsLeft = () => mockAccountTable.map((row) => row.id);

/** The argument of the one security event written, in a transaction or not. */
function securityEventWritten(): unknown {
  const writes = mockPrismaCalls.filter((call) =>
    call.name.endsWith("securityEvent.create"),
  );
  expect(writes).toHaveLength(1);
  return writes[0].args;
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetRateLimitStore();
  mockPrismaCalls.length = 0;
  giveTheUser([CREDENTIALS_ACCOUNT, GOOGLE_ACCOUNT]);
  mockFailingCall = null;
  mockAuth.mockResolvedValue(session());
});

describe("DELETE /api/auth/link-account/unlink with the correct password", () => {
  it("answers { success, message, provider, unlinkedAt } and nothing else", async () => {
    const res = await unlinkWith(PASSWORD);

    expect(res.status).toBe(200);
    const body = await res.json();
    // toEqual: the parsed body is an object of another realm, which
    // toStrictEqual refuses; JSON has no undefined for toEqual to overlook.
    expect(body).toEqual({
      success: true,
      message: "Account unlinked successfully",
      provider: "google",
      unlinkedAt: expect.any(String),
    });
    expect(new Date(body.unlinkedAt).toISOString()).toBe(body.unlinkedAt);
  });

  it("reads the user of the session, then deletes the Google accounts of that user, updates the user and writes the event in one transaction", async () => {
    // A user id in the body is not an identity: the session is.
    await del({
      password: PASSWORD,
      provider: "google",
      userId: OTHER_USER_ID,
    });

    expect(mockPrismaCalls).toStrictEqual([
      {
        name: "user.findUnique",
        args: { where: { id: USER_ID }, include: { accounts: true } },
      },
      { name: "$transaction", args: undefined },
      {
        name: "tx.account.deleteMany",
        args: { where: { userId: USER_ID, provider: "google" } },
      },
      {
        name: "tx.user.update",
        args: { where: { id: USER_ID }, data: { hasGoogleAccount: false } },
      },
      { name: "tx.securityEvent.create", args: expect.anything() },
    ]);
    // The credentials row stays, and so does another user's Google account.
    expect(accountsLeft()).toEqual([
      CREDENTIALS_ACCOUNT.id,
      GOOGLE_ACCOUNT_OF_ANOTHER_USER.id,
    ]);
  });

  // One unlink used to remove one row and to clear the flag: the second
  // Google account still signed in, and the user row said there was none.
  it("removes every Google account of the user in one call, and the event says how many", async () => {
    giveTheUser([CREDENTIALS_ACCOUNT, GOOGLE_ACCOUNT, SECOND_GOOGLE_ACCOUNT]);

    const res = await unlinkWith(PASSWORD);

    expect(res.status).toBe(200);
    expect(accountsLeft()).toEqual([
      CREDENTIALS_ACCOUNT.id,
      GOOGLE_ACCOUNT_OF_ANOTHER_USER.id,
    ]);
    // One statement for both rows, in the transaction that clears the flag.
    expect(prismaCallNames()).toEqual([
      "user.findUnique",
      "$transaction",
      "tx.account.deleteMany",
      "tx.user.update",
      "tx.securityEvent.create",
    ]);
    expect(securityEventWritten()).toMatchObject({
      data: {
        eventType: "account_unlinked",
        metadata: {
          provider: "google",
          accountsRemoved: 2,
          providerAccountIds: [
            GOOGLE_ACCOUNT.providerAccountId,
            SECOND_GOOGLE_ACCOUNT.providerAccountId,
          ],
          accountIds: [GOOGLE_ACCOUNT.id, SECOND_GOOGLE_ACCOUNT.id],
        },
      },
    });
  });

  // A link that is completed between the read and the delete: its row goes
  // too, and the number in the event is the database's, not that of the read.
  it("counts the rows the database removed, also one that the route had not read", async () => {
    mockAccountTable.push({ ...SECOND_GOOGLE_ACCOUNT, userId: USER_ID });

    const res = await unlinkWith(PASSWORD);

    expect(res.status).toBe(200);
    expect(accountsLeft()).toEqual([
      CREDENTIALS_ACCOUNT.id,
      GOOGLE_ACCOUNT_OF_ANOTHER_USER.id,
    ]);
    expect(securityEventWritten()).toMatchObject({
      data: {
        metadata: {
          accountsRemoved: 2,
          providerAccountIds: [GOOGLE_ACCOUNT.providerAccountId],
          accountIds: [GOOGLE_ACCOUNT.id],
        },
      },
    });
  });

  it("forgets Google as the last method used", async () => {
    mockUserRow = userRow({ lastLoginMethod: "google" });

    await unlinkWith(PASSWORD);

    expect(mockPrismaCalls).toContainEqual({
      name: "tx.user.update",
      args: {
        where: { id: USER_ID },
        data: { hasGoogleAccount: false, lastLoginMethod: null },
      },
    });
  });

  it("records account_unlinked with the provider, the number of rows removed and the accounts that were read", async () => {
    await unlinkWith(PASSWORD);

    expect(securityEventWritten()).toStrictEqual({
      data: {
        userId: USER_ID,
        eventType: "account_unlinked",
        details: "Successfully unlinked google account",
        success: true,
        ipAddress: CLIENT_ADDRESS,
        userAgent: USER_AGENT,
        metadata: {
          provider: "google",
          accountsRemoved: 1,
          providerAccountIds: [GOOGLE_ACCOUNT.providerAccountId],
          accountIds: [GOOGLE_ACCOUNT.id],
        },
      },
    });
  });

  // The password that was just checked is the other sign-in method, with
  // or without a credentials Account row.
  it("unlinks Google also when it is the only account row of the user", async () => {
    giveTheUser([GOOGLE_ACCOUNT]);

    const res = await unlinkWith(PASSWORD);

    expect(res.status).toBe(200);
    expect(accountsLeft()).toEqual([GOOGLE_ACCOUNT_OF_ANOTHER_USER.id]);
  });

  it("forgets the wrong passwords counted before it", async () => {
    const wrongOnes = RATE_LIMITS.passwordVerify.limit - 1;
    for (let attempt = 0; attempt < wrongOnes; attempt++) {
      expect((await unlinkWith("wrong")).status).toBe(401);
    }
    expect((await unlinkWith(PASSWORD)).status).toBe(200);

    // Google is linked again, to be unlinked a second time.
    giveTheUser([CREDENTIALS_ACCOUNT, GOOGLE_ACCOUNT]);
    // Without the reset, the second of these would be answered with 429.
    for (let attempt = 0; attempt < wrongOnes; attempt++) {
      expect((await unlinkWith("wrong")).status).toBe(401);
    }
    expect((await unlinkWith(PASSWORD)).status).toBe(200);
  });
});

describe("DELETE /api/auth/link-account/unlink, refused", () => {
  it.each([
    ["there is no session", null],
    ["the session has no user", { expires: new Date().toISOString() }],
    ["the session's user has no id", session({ email: "someone@example.com" })],
  ])("answers 401 when %s, before the database is asked", async (_, value) => {
    mockAuth.mockResolvedValue(value);

    const res = await unlinkWith(PASSWORD);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: "Authentication required",
      code: "authentication_required",
    });
    expect(mockPrismaCalls).toEqual([]);
  });

  it("answers 429 with Retry-After after five wrong passwords, even to the right one", async () => {
    expect(RATE_LIMITS.passwordVerify).toEqual({
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await unlinkWith("wrong")).status).toBe(401);
    }
    mockPrismaCalls.length = 0;

    const res = await unlinkWith(PASSWORD);

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      error: "Too many attempts. Please try again later.",
      code: "too_many_attempts",
    });
    const retryAfter = Number(res.headers.get("retry-after"));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    // Throttled before the password is looked at.
    expect(mockPrismaCalls).toEqual([]);
  });

  it.each([
    ["the password is missing", { provider: "google" }],
    ["the password is empty", { password: "", provider: "google" }],
    ["the provider is missing", { password: PASSWORD }],
  ])("answers 400 when %s", async (_, body) => {
    const res = await del(body);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Password and provider are required",
      code: "missing_fields",
    });
    expect(mockPrismaCalls).toEqual([]);
  });

  it.each([
    ["is not JSON", "{ not json"],
    ["is empty", ""],
    ["is JSON null", "null"],
    ["is a JSON string", '"google"'],
    ["is a JSON number", "5"],
  ])(
    "answers 400 when the body %s, before the database is asked",
    async (_, body) => {
      const res = await delText(body);

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Invalid request body",
        code: "invalid_request",
      });
      expect(mockPrismaCalls).toEqual([]);
    },
  );

  it.each([
    ["the password is a number", { password: 12345678, provider: "google" }],
    ["the password is an object", { password: {}, provider: "google" }],
    ["the password is a list", { password: [PASSWORD], provider: "google" }],
    ["the password is true", { password: true, provider: "google" }],
    ["the provider is a list", { password: PASSWORD, provider: ["google"] }],
    ["the provider is an object", { password: PASSWORD, provider: {} }],
  ])("answers 400 when %s, before the database is asked", async (_, body) => {
    const res = await del(body);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid request body",
      code: "invalid_request",
    });
    expect(mockPrismaCalls).toEqual([]);
  });

  // "credentials" is the provider of the Account row that registration
  // writes: with the right password the route used to delete that row and to
  // clear `lastLoginMethod`.
  it.each(["credentials", "github", "Google", "google "])(
    "answers 400 for the provider %j, with the right password too, before the user is read",
    async (provider) => {
      const res = await del({ password: PASSWORD, provider });

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Unsupported provider",
        code: "unsupported_provider",
      });
      expect(mockPrismaCalls).toEqual([]);
    },
  );

  it("does not count a request it answers with 400 as a wrong password", async () => {
    // More of them than the wrong passwords the throttle allows.
    for (let n = 0; n < RATE_LIMITS.passwordVerify.limit + 1; n++) {
      expect((await delText("{ not json")).status).toBe(400);
      expect(
        (await del({ password: 12345678, provider: "google" })).status,
      ).toBe(400);
      expect((await del({ provider: "google" })).status).toBe(400);
      expect(
        (await del({ password: PASSWORD, provider: "credentials" })).status,
      ).toBe(400);
    }

    expect((await unlinkWith("wrong")).status).toBe(401);
    expect((await unlinkWith(PASSWORD)).status).toBe(200);
  });

  it.each([
    ["the user no longer exists", null, "user_not_found"],
    [
      "the account has no password",
      userRow({ password: null }),
      "password_not_set",
    ],
  ])("answers 404 when %s, and writes nothing", async (_, row, code) => {
    mockUserRow = row;

    const res = await unlinkWith(PASSWORD);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "User not found or no password set",
      code,
    });
    expect(prismaCallNames()).toEqual(["user.findUnique"]);
  });

  it("answers 401 to a wrong password and records account_unlink_failed", async () => {
    const res = await unlinkWith("wrong");

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid password",
      code: "invalid_password",
    });
    expect(prismaCallNames()).toEqual([
      "user.findUnique",
      "securityEvent.create",
    ]);
    expect(securityEventWritten()).toStrictEqual({
      data: {
        userId: USER_ID,
        eventType: "account_unlink_failed",
        details: "Password verification failed during account unlinking",
        success: false,
        ipAddress: CLIENT_ADDRESS,
        userAgent: USER_AGENT,
      },
    });
  });

  it("answers 404 when Google is not linked, and writes nothing", async () => {
    giveTheUser([CREDENTIALS_ACCOUNT]);

    const res = await unlinkWith(PASSWORD);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Account not linked to this provider",
      code: "not_linked",
    });
    expect(prismaCallNames()).toEqual(["user.findUnique"]);
  });

  // Another request unlinked Google between the read and the delete. This
  // one removed nothing: it clears no flag and records no unlinking.
  it("answers 404 when the Google account it read is gone when it deletes, and writes nothing else", async () => {
    mockAccountTable = mockAccountTable.filter(
      (row) => row.id !== GOOGLE_ACCOUNT.id,
    );

    const res = await unlinkWith(PASSWORD);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Account not linked to this provider",
      code: "not_linked",
    });
    expect(prismaCallNames()).toEqual([
      "user.findUnique",
      "$transaction",
      "tx.account.deleteMany",
    ]);
  });

  it("answers 500 without details when the database fails", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    mockUserRow = new Error("connection refused");

    const res = await unlinkWith(PASSWORD);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Failed to unlink account",
      code: "internal_error",
    });
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  it("answers 500 when a write of the transaction fails, and does not go on to the event", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    mockFailingCall = "tx.user.update";

    const res = await unlinkWith(PASSWORD);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Failed to unlink account",
      code: "internal_error",
    });
    expect(prismaCallNames()).toEqual([
      "user.findUnique",
      "$transaction",
      "tx.account.deleteMany",
      "tx.user.update",
    ]);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });
});

describe("DELETE /api/auth/link-account/unlink, what the five wrong passwords are counted for", () => {
  /** As many wrong passwords as the limit allows, each answered with 401. */
  async function useUpTheLimit(attempt: () => Promise<Response>) {
    for (let n = 0; n < RATE_LIMITS.passwordVerify.limit; n++) {
      expect((await attempt()).status).toBe(401);
    }
  }

  function signInAs(id: string) {
    mockAuth.mockResolvedValue(session({ id }));
    giveTheUser([CREDENTIALS_ACCOUNT, GOOGLE_ACCOUNT], id);
  }

  it("the account: the same user is refused from another address", async () => {
    await useUpTheLimit(() => unlinkWith("wrong"));

    const res = await unlinkWith(PASSWORD, from(OTHER_ADDRESS));

    expect(res.status).toBe(429);
  });

  it("the client address: another user is refused from the same address", async () => {
    await useUpTheLimit(() => unlinkWith("wrong"));
    signInAs(OTHER_USER_ID);

    // That user is served from another address: the count is not for everyone.
    expect((await unlinkWith(PASSWORD, from(OTHER_ADDRESS))).status).toBe(200);
    expect((await unlinkWith(PASSWORD)).status).toBe(429);
  });

  it("the first entry of X-Forwarded-For, not the header as a whole", async () => {
    await useUpTheLimit(() => unlinkWith("wrong"));
    signInAs(OTHER_USER_ID);

    // The same client through another proxy, and through none.
    const throughAnotherProxy = from(`${CLIENT_ADDRESS}, 192.0.2.1`);
    expect((await unlinkWith(PASSWORD, throughAnotherProxy)).status).toBe(429);
    expect((await unlinkWith(PASSWORD, from(CLIENT_ADDRESS))).status).toBe(429);
  });

  it("both routes: wrong passwords at the initiate route are refused here", async () => {
    await useUpTheLimit(() => initiateWith("wrong"));

    const res = await unlinkWith(PASSWORD);

    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("both routes: wrong passwords here are refused at the initiate route", async () => {
    await useUpTheLimit(() => unlinkWith("wrong"));

    const res = await initiateWith(PASSWORD);

    expect(res.status).toBe(429);
  });

  it("both routes: the correct password at the initiate route forgets the wrong ones given here", async () => {
    // Google is not linked yet, or the initiate route would not accept.
    mockUserRow = userRow({ accounts: [CREDENTIALS_ACCOUNT] });
    for (let n = 0; n < RATE_LIMITS.passwordVerify.limit - 1; n++) {
      expect((await unlinkWith("wrong")).status).toBe(401);
    }
    expect((await initiateWith(PASSWORD)).status).toBe(200);

    // Without the reset, the second of these would be answered with 429.
    expect((await unlinkWith("wrong")).status).toBe(401);
    expect((await unlinkWith("wrong")).status).toBe(401);
  });
});

describe.each([
  ["account_unlink_failed", "wrong"],
  ["account_unlinked", PASSWORD],
])("the address and the browser recorded in %s", (eventType, password) => {
  /** The `data` of the event written for a request with these headers. */
  async function recorded(
    headers: RequestHeaders,
  ): Promise<Record<string, unknown>> {
    await unlinkWith(password, headers);
    const written = securityEventWritten() as { data: Record<string, unknown> };
    expect(written.data.eventType).toBe(eventType);
    return written.data;
  }

  it("are the first entry of X-Forwarded-For, also when X-Real-IP is set, and the User-Agent", async () => {
    const event = await recorded({ ...PROXIED, "x-real-ip": REAL_IP });

    expect(event).toMatchObject({
      ipAddress: CLIENT_ADDRESS,
      userAgent: USER_AGENT,
    });
  });

  it("are X-Real-IP when there is no X-Forwarded-For", async () => {
    const event = await recorded({
      "x-real-ip": REAL_IP,
      "user-agent": USER_AGENT,
    });

    expect(event).toMatchObject({ ipAddress: REAL_IP, userAgent: USER_AGENT });
  });

  it("are no forwarded value that is not an IP address", async () => {
    const event = await recorded({
      "x-forwarded-for": "<script>, unknown",
      "user-agent": USER_AGENT,
    });

    expect(event.ipAddress).toBeUndefined();
    expect(event.userAgent).toBe(USER_AGENT);
  });

  it("are a User-Agent cut to 512 characters", async () => {
    const longAgent = "A".repeat(600) + "B".repeat(600);

    const event = await recorded({ ...PROXIED, "user-agent": longAgent });

    expect(event.userAgent).toBe(longAgent.slice(0, 512));
  });

  it("are left out when the request has none of these headers", async () => {
    const event = await recorded({});

    expect(event.ipAddress).toBeUndefined();
    expect(event.userAgent).toBeUndefined();
  });
});

describe("/api/auth/link-account/unlink methods", () => {
  it("exports DELETE only", () => {
    expect(Object.keys(route)).toEqual(["DELETE"]);
  });
});
