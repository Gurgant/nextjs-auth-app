/**
 * @jest-environment node
 */

/**
 * Contract of DELETE /api/auth/link-account/unlink: the account page unlinks
 * Google with it, after asking for the password
 * (src/components/account/oauth-account-linking.tsx). In the order the route
 * decides:
 *   no session / session without a user id  -> 401
 *   five wrong passwords within 15 minutes  -> 429 + Retry-After
 *   password or provider missing            -> 400
 *   user gone, or account without password  -> 404
 *   wrong password                          -> 401, counted, and an
 *                                              "account_unlink_failed" event
 *   no account of that provider             -> 404
 *   correct password                        -> 200 { success, message,
 *                                              provider, unlinkedAt }
 * With the 200, in one transaction: the Account row is deleted, the user row
 * loses `hasGoogleAccount` (and `lastLoginMethod` when Google was the last
 * method used) and an "account_unlinked" event is written.
 *
 * The route holds one more answer, 400 "Cannot unlink the only authentication
 * method". No request gets it: an account without a password is answered 404
 * before it, so the password is always the other method.
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
// recorded as "tx.<model>.<method>".
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

function mockPrismaCall(name: string, args: unknown): Promise<unknown> {
  mockPrismaCalls.push({ name, args });
  if (name === mockFailingCall) {
    return Promise.reject(new Error("write refused"));
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
  mockUserRow = userRow();
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

  it("reads the user of the session, then deletes the account, updates the user and writes the event in one transaction", async () => {
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
        name: "tx.account.delete",
        args: { where: { id: GOOGLE_ACCOUNT.id } },
      },
      {
        name: "tx.user.update",
        args: { where: { id: USER_ID }, data: { hasGoogleAccount: false } },
      },
      { name: "tx.securityEvent.create", args: expect.anything() },
    ]);
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

  it("records account_unlinked with the provider and the account that was removed", async () => {
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
          providerAccountId: GOOGLE_ACCOUNT.providerAccountId,
          accountId: GOOGLE_ACCOUNT.id,
        },
      },
    });
  });

  // The password is the other method: no request reaches the answer "Cannot
  // unlink the only authentication method".
  it("unlinks Google also when it is the only account row of the user", async () => {
    mockUserRow = userRow({ accounts: [GOOGLE_ACCOUNT] });

    const res = await unlinkWith(PASSWORD);

    expect(res.status).toBe(200);
    expect(prismaCallNames()).toContain("tx.account.delete");
  });

  it("forgets the wrong passwords counted before it", async () => {
    const wrongOnes = RATE_LIMITS.passwordVerify.limit - 1;
    for (let attempt = 0; attempt < wrongOnes; attempt++) {
      expect((await unlinkWith("wrong")).status).toBe(401);
    }
    expect((await unlinkWith(PASSWORD)).status).toBe(200);

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
    });
    expect(mockPrismaCalls).toEqual([]);
  });

  it.each([
    ["the user no longer exists", null],
    ["the account has no password", userRow({ password: null })],
  ])("answers 404 when %s, and writes nothing", async (_, row) => {
    mockUserRow = row;

    const res = await unlinkWith(PASSWORD);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "User not found or no password set",
    });
    expect(prismaCallNames()).toEqual(["user.findUnique"]);
  });

  it("answers 401 to a wrong password and records account_unlink_failed", async () => {
    const res = await unlinkWith("wrong");

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Invalid password" });
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

  it.each([
    [
      "Google is not linked",
      { password: PASSWORD, provider: "google" },
      userRow({ accounts: [CREDENTIALS_ACCOUNT] }),
    ],
    [
      "the user has no account of the provider named",
      { password: PASSWORD, provider: "github" },
      userRow(),
    ],
  ])("answers 404 when %s, and writes nothing", async (_, body, row) => {
    mockUserRow = row;

    const res = await del(body);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Account not linked to this provider",
    });
    expect(prismaCallNames()).toEqual(["user.findUnique"]);
  });

  it("answers 500 without details when the database fails", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    mockUserRow = new Error("connection refused");

    const res = await unlinkWith(PASSWORD);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Failed to unlink account",
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
    });
    expect(prismaCallNames()).toEqual([
      "user.findUnique",
      "$transaction",
      "tx.account.delete",
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
    mockUserRow = userRow({ id });
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
