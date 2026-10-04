/**
 * @jest-environment node
 */

/**
 * Contract of POST /api/auth/link-account/initiate: the password check the
 * account page makes before it starts the Google sign-in that links the
 * account (src/components/account/oauth-account-linking.tsx). In the order
 * the route decides:
 *   no session / session without a user id  -> 401
 *   five wrong passwords within 15 minutes  -> 429 + Retry-After
 *   password or provider missing            -> 400
 *   a provider other than "google"          -> 400
 *   user gone, or account without password  -> 404
 *   wrong password                          -> 401, counted, and an
 *                                              "account_link_failed" event
 *   Google already linked                   -> 400
 *   correct password                        -> 200 { success, provider } and
 *                                              an "account_link_initiated"
 *                                              event
 * The route links nothing and hands out no token: the security event is its
 * only write.
 *
 * The wrong passwords are counted per account and per client address (the
 * first entry of X-Forwarded-For), and in one count with those of the unlink
 * route (DELETE /api/auth/link-account/unlink): SECURITY.md, "Abuse
 * prevention". The events record the address header as it came.
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
// `mockPrismaCalls` instead of going unnoticed.
jest.mock("@/lib/prisma", () => {
  const delegate = (model: string) =>
    new Proxy(
      {},
      {
        get: (_target, method) => (args: unknown) =>
          mockPrismaCall(`${model}.${String(method)}`, args),
      },
    );
  return {
    prisma: new Proxy({}, { get: (_target, model) => delegate(String(model)) }),
  };
});

import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { __resetRateLimitStore, RATE_LIMITS } from "@/lib/rate-limit";
import { DELETE as unlink } from "../../unlink/route";
import * as route from "../route";

const { POST } = route;

const mockAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;

/** The calls the route made on the Prisma client, in order. */
const mockPrismaCalls: { name: string; args: unknown }[] = [];
/** What prisma.user.findUnique answers: a row, null, or an Error to throw. */
let mockUserRow: unknown = null;

function mockPrismaCall(name: string, args: unknown): Promise<unknown> {
  mockPrismaCalls.push({ name, args });
  if (name !== "user.findUnique") return Promise.resolve({ id: "new-row" });
  return mockUserRow instanceof Error
    ? Promise.reject(mockUserRow)
    : Promise.resolve(mockUserRow);
}

const INITIATE_URL = "http://localhost:3000/api/auth/link-account/initiate";
const UNLINK_URL = "http://localhost:3000/api/auth/link-account/unlink";
const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";
const PASSWORD = "Correct-Horse-1";
// Cost 4, the lowest bcrypt has: the check under test is the comparison.
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const CLIENT_ADDRESS = "203.0.113.7";
const OTHER_ADDRESS = "192.0.2.200";
// A client behind a proxy. The events record this header as it came; the
// throttle counts its first entry.
const FORWARDED_FOR = `${CLIENT_ADDRESS}, 198.51.100.9`;
const REAL_IP = "192.0.2.44";
const USER_AGENT = "jest-route-test";

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

const userRow = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  email: "someone@example.com",
  password: PASSWORD_HASH,
  accounts: [{ provider: "credentials" }],
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

const post = (body: unknown, headers: RequestHeaders = PROXIED) =>
  POST(jsonRequest(INITIATE_URL, "POST", body, headers));

const postPassword = (password: string, headers?: RequestHeaders) =>
  post({ password, provider: "google" }, headers);

/** The same password check at the unlink route, with the same headers. */
const unlinkPassword = (password: string) =>
  unlink(
    jsonRequest(
      UNLINK_URL,
      "DELETE",
      { password, provider: "google" },
      PROXIED,
    ),
  );

const prismaCallNames = () => mockPrismaCalls.map((call) => call.name);

/** The argument of the one prisma.securityEvent.create call. */
function securityEventWritten(): unknown {
  const writes = mockPrismaCalls.filter(
    (call) => call.name === "securityEvent.create",
  );
  expect(writes).toHaveLength(1);
  return writes[0].args;
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetRateLimitStore();
  mockPrismaCalls.length = 0;
  mockUserRow = userRow();
  mockAuth.mockResolvedValue(session());
});

describe("POST /api/auth/link-account/initiate with the correct password", () => {
  it("answers { success, provider } and nothing else", async () => {
    const res = await postPassword(PASSWORD);

    expect(res.status).toBe(200);
    // toEqual: the parsed body is an object of another realm, which
    // toStrictEqual refuses; JSON has no undefined for toEqual to overlook.
    await expect(res.json()).resolves.toEqual({
      success: true,
      provider: "google",
    });
  });

  // What the answer carried while the route still created a link request.
  it.each(["linkToken", "expiresAt"])("answers without %s", async (field) => {
    const body = await (await postPassword(PASSWORD)).json();

    expect(body).not.toHaveProperty(field);
  });

  it("reads the user of the session and writes one security event, nothing else", async () => {
    // A user id in the body is not an identity: the session is.
    await post({
      password: PASSWORD,
      provider: "google",
      userId: OTHER_USER_ID,
    });

    expect(mockPrismaCalls).toStrictEqual([
      {
        name: "user.findUnique",
        args: { where: { id: USER_ID }, include: { accounts: true } },
      },
      { name: "securityEvent.create", args: expect.anything() },
    ]);
  });

  it("records account_link_initiated with the provider and no link request", async () => {
    await postPassword(PASSWORD);

    expect(securityEventWritten()).toStrictEqual({
      data: {
        userId: USER_ID,
        eventType: "account_link_initiated",
        details: "Account linking initiated for provider: google",
        success: true,
        ipAddress: FORWARDED_FOR,
        userAgent: USER_AGENT,
        metadata: { provider: "google" },
      },
    });
  });

  it("forgets the wrong passwords counted before it", async () => {
    const wrongOnes = RATE_LIMITS.passwordVerify.limit - 1;
    for (let attempt = 0; attempt < wrongOnes; attempt++) {
      expect((await postPassword("wrong")).status).toBe(401);
    }
    expect((await postPassword(PASSWORD)).status).toBe(200);

    // Without the reset, the second of these would be answered with 429.
    for (let attempt = 0; attempt < wrongOnes; attempt++) {
      expect((await postPassword("wrong")).status).toBe(401);
    }
    expect((await postPassword(PASSWORD)).status).toBe(200);
  });
});

describe("POST /api/auth/link-account/initiate, refused", () => {
  it.each([
    ["there is no session", null],
    ["the session has no user", { expires: new Date().toISOString() }],
    ["the session's user has no id", session({ email: "someone@example.com" })],
  ])("answers 401 when %s, before the database is asked", async (_, value) => {
    mockAuth.mockResolvedValue(value);

    const res = await postPassword(PASSWORD);

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
      expect((await postPassword("wrong")).status).toBe(401);
    }
    mockPrismaCalls.length = 0;

    const res = await postPassword(PASSWORD);

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
    const res = await post(body);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Password and provider are required",
    });
    expect(mockPrismaCalls).toEqual([]);
  });

  it("answers 400 for a provider other than google", async () => {
    const res = await post({ password: PASSWORD, provider: "github" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Unsupported provider",
    });
    expect(mockPrismaCalls).toEqual([]);
  });

  it.each([
    ["the user no longer exists", null],
    ["the account has no password", userRow({ password: null })],
  ])("answers 404 when %s, and writes nothing", async (_, row) => {
    mockUserRow = row;

    const res = await postPassword(PASSWORD);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "User not found or no password set",
    });
    expect(prismaCallNames()).toEqual(["user.findUnique"]);
  });

  it("answers 401 to a wrong password and records account_link_failed", async () => {
    const res = await postPassword("wrong");

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Invalid password" });
    expect(prismaCallNames()).toEqual([
      "user.findUnique",
      "securityEvent.create",
    ]);
    expect(securityEventWritten()).toStrictEqual({
      data: {
        userId: USER_ID,
        eventType: "account_link_failed",
        details: "Password verification failed during account linking",
        success: false,
        ipAddress: FORWARDED_FOR,
        userAgent: USER_AGENT,
      },
    });
  });

  it("answers 400 when Google is already linked, and writes nothing", async () => {
    mockUserRow = userRow({
      accounts: [{ provider: "credentials" }, { provider: "google" }],
    });

    const res = await postPassword(PASSWORD);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Account already linked to this provider",
    });
    expect(prismaCallNames()).toEqual(["user.findUnique"]);
  });

  it("answers 500 without details when the database fails", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    mockUserRow = new Error("connection refused");

    const res = await postPassword(PASSWORD);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Internal server error",
    });
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });
});

describe("POST /api/auth/link-account/initiate, what the five wrong passwords are counted for", () => {
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
    await useUpTheLimit(() => postPassword("wrong"));

    const res = await postPassword(PASSWORD, from(OTHER_ADDRESS));

    expect(res.status).toBe(429);
  });

  it("the client address: another user is refused from the same address", async () => {
    await useUpTheLimit(() => postPassword("wrong"));
    signInAs(OTHER_USER_ID);

    // That user is served from another address: the count is not for everyone.
    expect((await postPassword(PASSWORD, from(OTHER_ADDRESS))).status).toBe(
      200,
    );
    expect((await postPassword(PASSWORD)).status).toBe(429);
  });

  it("the first entry of X-Forwarded-For, not the header as a whole", async () => {
    await useUpTheLimit(() => postPassword("wrong"));
    signInAs(OTHER_USER_ID);

    // The same client through another proxy, and through none.
    const throughAnotherProxy = from(`${CLIENT_ADDRESS}, 192.0.2.1`);
    expect((await postPassword(PASSWORD, throughAnotherProxy)).status).toBe(
      429,
    );
    expect((await postPassword(PASSWORD, from(CLIENT_ADDRESS))).status).toBe(
      429,
    );
  });

  it("both routes: wrong passwords at the unlink route are refused here", async () => {
    await useUpTheLimit(() => unlinkPassword("wrong"));

    const res = await postPassword(PASSWORD);

    expect(res.status).toBe(429);
  });

  it("both routes: wrong passwords here are refused at the unlink route", async () => {
    await useUpTheLimit(() => postPassword("wrong"));

    const res = await unlinkPassword(PASSWORD);

    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe.each([
  ["account_link_failed", "wrong"],
  ["account_link_initiated", PASSWORD],
])("the address and the browser recorded in %s", (eventType, password) => {
  /** The event written for a request with these headers. */
  async function recorded(headers: RequestHeaders): Promise<unknown> {
    await postPassword(password, headers);
    return securityEventWritten();
  }

  it("are X-Forwarded-For as it came, also when X-Real-IP is set, and User-Agent", async () => {
    const event = await recorded({ ...PROXIED, "x-real-ip": REAL_IP });

    expect(event).toMatchObject({
      data: { eventType, ipAddress: FORWARDED_FOR, userAgent: USER_AGENT },
    });
  });

  it("are X-Real-IP when there is no X-Forwarded-For", async () => {
    const event = await recorded({
      "x-real-ip": REAL_IP,
      "user-agent": USER_AGENT,
    });

    expect(event).toMatchObject({
      data: { eventType, ipAddress: REAL_IP, userAgent: USER_AGENT },
    });
  });

  it('are "unknown" when the request has none of these headers', async () => {
    const event = await recorded({});

    expect(event).toMatchObject({
      data: { eventType, ipAddress: "unknown", userAgent: "unknown" },
    });
  });
});

describe("/api/auth/link-account/initiate methods", () => {
  it("exports POST only", () => {
    expect(Object.keys(route)).toEqual(["POST"]);
  });
});
