/**
 * @jest-environment node
 */

/**
 * Contract of POST /api/auth/link-account/initiate: the password check the
 * account page makes before it starts the Google sign-in that links the
 * account (src/components/account/oauth-account-linking.tsx). In the order
 * the route decides, each refusal with its `code`:
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
 *                                              and an "account_link_failed"
 *                                              event
 *   Google already linked                   -> 400 already_linked
 *   a failing database                      -> 500 internal_error
 *   correct password                        -> 200 { success, provider }, a
 *                                              link grant on the user's row
 *                                              and an
 *                                              "account_link_initiated" event
 * A refusal answers { error, code }: the English text, and the code that the
 * account page translates (src/lib/auth/link-account-errors.ts). The route
 * links nothing and hands out no token: the grant (two columns of the user's
 * row, src/lib/auth/link-grant.ts) and the security event are its only
 * writes, and the grant is written only after every check has passed. The
 * two are written in one transaction: when either cannot be written, neither
 * stays.
 *
 * The wrong passwords are counted per account and per client address (the
 * first entry of X-Forwarded-For), and in one count with those of the unlink
 * route (DELETE /api/auth/link-account/unlink): SECURITY.md, "Abuse
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
// recorded as "tx.<model>.<method>". What the writes would leave in a
// database is in `mockWritesKept`: a write outside a transaction at once, the
// writes of a transaction when its callback has resolved, and none of them
// when it has rejected.
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
            ? (run: (tx: unknown) => Promise<unknown>) =>
                mockTransaction(() => run(client("tx.")))
            : delegate(`${prefix}${String(model)}`),
      },
    );
  return { prisma: client("") };
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
/** The writes among them that a database would keep, as "<model>.<method>". */
const mockWritesKept: string[] = [];
/** The writes of the transaction that is running. */
const mockWritesPending: string[] = [];
/** What prisma.user.findUnique answers: a row, null, or an Error to throw. */
let mockUserRow: unknown = null;
/** The one call that fails, in a transaction or outside one, when a test names one. */
let mockFailingCall: string | null = null;

function mockPrismaCall(name: string, args: unknown): Promise<unknown> {
  mockPrismaCalls.push({ name, args });
  const inTransaction = name.startsWith("tx.");
  const call = inTransaction ? name.slice("tx.".length) : name;
  if (call === mockFailingCall) {
    return Promise.reject(new Error("write refused"));
  }
  if (call !== "user.findUnique") {
    (inTransaction ? mockWritesPending : mockWritesKept).push(call);
    return Promise.resolve({ id: "new-row" });
  }
  return mockUserRow instanceof Error
    ? Promise.reject(mockUserRow)
    : Promise.resolve(mockUserRow);
}

async function mockTransaction(run: () => Promise<unknown>): Promise<unknown> {
  mockPrismaCalls.push({ name: "$transaction", args: undefined });
  mockWritesPending.length = 0;
  try {
    const result = await run();
    mockWritesKept.push(...mockWritesPending);
    return result;
  } finally {
    mockWritesPending.length = 0;
  }
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
// A client behind a proxy. The throttle counts the first entry of this
// header, and the events record that entry.
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

/** A request whose body is this text as it is, JSON or not. */
const postText = (body: string) =>
  POST(
    new NextRequest(INITIATE_URL, {
      method: "POST",
      headers: { "content-type": "application/json", ...PROXIED },
      body,
    }),
  );

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

/** The argument of the one securityEvent.create call, in a transaction or not. */
function securityEventWritten(): unknown {
  const writes = mockPrismaCalls.filter(
    (call) =>
      call.name === "securityEvent.create" ||
      call.name === "tx.securityEvent.create",
  );
  expect(writes).toHaveLength(1);
  return writes[0].args;
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetRateLimitStore();
  mockPrismaCalls.length = 0;
  mockWritesKept.length = 0;
  mockUserRow = userRow();
  mockFailingCall = null;
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

  it("reads the user of the session, writes the link grant on that row and one security event in one transaction, nothing else", async () => {
    const before = Date.now();
    // A user id in the body is not an identity: the session is.
    await post({
      password: PASSWORD,
      provider: "google",
      userId: OTHER_USER_ID,
    });
    const after = Date.now();

    expect(mockPrismaCalls).toStrictEqual([
      {
        name: "user.findUnique",
        args: { where: { id: USER_ID }, include: { accounts: true } },
      },
      { name: "$transaction", args: undefined },
      {
        name: "tx.user.update",
        args: {
          where: { id: USER_ID },
          data: {
            linkGrantProvider: "google",
            linkGrantExpiresAt: expect.any(Date),
          },
        },
      },
      { name: "tx.securityEvent.create", args: expect.anything() },
    ]);
    expect(mockWritesKept).toEqual(["user.update", "securityEvent.create"]);
    // The grant ends 300 seconds after the request (LINK_GRANT_TTL_SECONDS).
    const grant = mockPrismaCalls[2].args as {
      data: { linkGrantExpiresAt: Date };
    };
    const end = grant.data.linkGrantExpiresAt.getTime();
    expect(end).toBeGreaterThanOrEqual(before + 300_000);
    expect(end).toBeLessThanOrEqual(after + 300_000);
  });

  it("answers 500 and records no initiation when the grant cannot be written", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    mockFailingCall = "user.update";

    const res = await postPassword(PASSWORD);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Internal server error",
      code: "internal_error",
    });
    expect(prismaCallNames()).toEqual([
      "user.findUnique",
      "$transaction",
      "tx.user.update",
    ]);
    expect(mockWritesKept).toEqual([]);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  // A grant without its event could be spent for five minutes with nothing
  // in the audit trail that says a link was started.
  it("answers 500 and leaves no grant when the event cannot be written", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    mockFailingCall = "securityEvent.create";

    const res = await postPassword(PASSWORD);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Internal server error",
      code: "internal_error",
    });
    expect(mockWritesKept).toEqual([]);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  it("records account_link_initiated with the provider and no link request", async () => {
    await postPassword(PASSWORD);

    expect(securityEventWritten()).toStrictEqual({
      data: {
        userId: USER_ID,
        eventType: "account_link_initiated",
        details: "Account linking initiated for provider: google",
        success: true,
        ipAddress: CLIENT_ADDRESS,
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
      expect((await postPassword("wrong")).status).toBe(401);
    }
    mockPrismaCalls.length = 0;

    const res = await postPassword(PASSWORD);

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
    const res = await post(body);

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
      const res = await postText(body);

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
    const res = await post(body);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid request body",
      code: "invalid_request",
    });
    expect(mockPrismaCalls).toEqual([]);
  });

  it("does not count a request it answers with 400 as a wrong password", async () => {
    // More of them than the wrong passwords the throttle allows.
    for (let n = 0; n < RATE_LIMITS.passwordVerify.limit + 1; n++) {
      expect((await postText("{ not json")).status).toBe(400);
      expect(
        (await post({ password: 12345678, provider: "google" })).status,
      ).toBe(400);
      expect((await post({ provider: "google" })).status).toBe(400);
      expect(
        (await post({ password: PASSWORD, provider: "github" })).status,
      ).toBe(400);
    }

    expect((await postPassword("wrong")).status).toBe(401);
    expect((await postPassword(PASSWORD)).status).toBe(200);
  });

  it("answers 400 for a provider other than google", async () => {
    const res = await post({ password: PASSWORD, provider: "github" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Unsupported provider",
      code: "unsupported_provider",
    });
    expect(mockPrismaCalls).toEqual([]);
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

    const res = await postPassword(PASSWORD);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "User not found or no password set",
      code,
    });
    expect(prismaCallNames()).toEqual(["user.findUnique"]);
  });

  it("answers 401 to a wrong password and records account_link_failed", async () => {
    const res = await postPassword("wrong");

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
        eventType: "account_link_failed",
        details: "Password verification failed during account linking",
        success: false,
        ipAddress: CLIENT_ADDRESS,
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
      code: "already_linked",
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
      code: "internal_error",
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
  /** The `data` of the event written for a request with these headers. */
  async function recorded(
    headers: RequestHeaders,
  ): Promise<Record<string, unknown>> {
    await postPassword(password, headers);
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

describe("/api/auth/link-account/initiate methods", () => {
  it("exports POST only", () => {
    expect(Object.keys(route)).toEqual(["POST"]);
  });
});
