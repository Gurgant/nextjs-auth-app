/**
 * @jest-environment node
 *
 * The session guard (src/lib/auth/session-revocation.ts) on a mocked Prisma
 * client: which tokens are still live, what a sign-out stores, and that a
 * database error never lets a token through.
 */
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    revokedSession: {
      findUnique: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import type { JWT } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import {
  REVOCATION_GRACE_SECONDS,
  createVerifiedDecode,
  newSessionId,
  readSessionVersion,
  revokeSession,
  verifySessionToken,
} from "@/lib/auth/session-revocation";
import { MAX_SESSION_MAX_AGE_SECONDS } from "@/lib/session-config";

const mockUserFind = prisma.user.findUnique as unknown as jest.Mock;
const mockRevokedFind = prisma.revokedSession
  .findUnique as unknown as jest.Mock;
const mockRevokedCreate = prisma.revokedSession
  .createMany as unknown as jest.Mock;
const mockRevokedDelete = prisma.revokedSession
  .deleteMany as unknown as jest.Mock;

const databaseCalls = () =>
  mockUserFind.mock.calls.length +
  mockRevokedFind.mock.calls.length +
  mockRevokedCreate.mock.calls.length +
  mockRevokedDelete.mock.calls.length;

const DB_DOWN = new Error("Can't reach database server");

const CLAIMS = {
  id: "user-1",
  sid: "sid-1",
  sv: 0,
  sub: "user-1",
  email: "alice@example.com",
  name: "Alice",
  emailVerified: null,
  twoFactorEnabled: false,
  role: "USER",
};

const liveToken = (claims: Record<string, unknown> = {}): JWT =>
  ({ ...CLAIMS, ...claims }) as JWT;

/** The token without one of its claims (a token issued before the claim existed). */
const tokenWithout = (claim: "id" | "sid" | "sv"): JWT =>
  Object.fromEntries(
    Object.entries(CLAIMS).filter(([name]) => name !== claim),
  ) as JWT;

const savedMaxAge = process.env.SESSION_MAX_AGE;

beforeEach(() => {
  jest.resetAllMocks();
  // next/jest loads the developer's .env; pin the lifetime to its default.
  delete process.env.SESSION_MAX_AGE;
  mockUserFind.mockResolvedValue({ role: "USER", sessionVersion: 0 });
  mockRevokedFind.mockResolvedValue(null);
  mockRevokedCreate.mockResolvedValue({ count: 1 });
  mockRevokedDelete.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  if (savedMaxAge === undefined) delete process.env.SESSION_MAX_AGE;
  else process.env.SESSION_MAX_AGE = savedMaxAge;
});

describe("verifySessionToken", () => {
  it("returns the same token for a live session, with exactly two lookups", async () => {
    const token = liveToken();

    await expect(verifySessionToken(token)).resolves.toBe(token);

    expect(mockUserFind).toHaveBeenCalledTimes(1);
    expect(mockUserFind).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { role: true, sessionVersion: true },
    });
    expect(mockRevokedFind).toHaveBeenCalledTimes(1);
    expect(mockRevokedFind).toHaveBeenCalledWith({
      where: { sid: "sid-1" },
      select: { sid: true },
    });
    expect(databaseCalls()).toBe(2);
  });

  it("returns null when the session was revoked", async () => {
    mockRevokedFind.mockResolvedValue({ sid: "sid-1" });

    await expect(verifySessionToken(liveToken())).resolves.toBeNull();
  });

  it("returns null without a database call for a token that has no sid", async () => {
    await expect(verifySessionToken(tokenWithout("sid"))).resolves.toBeNull();

    expect(databaseCalls()).toBe(0);
  });

  it("returns null without a database call for a token that has no id", async () => {
    await expect(verifySessionToken(tokenWithout("id"))).resolves.toBeNull();

    expect(databaseCalls()).toBe(0);
  });

  it("rejects when the revocation lookup fails (fail closed)", async () => {
    mockRevokedFind.mockRejectedValue(DB_DOWN);

    await expect(verifySessionToken(liveToken())).rejects.toBe(DB_DOWN);
  });

  it("rejects when the user lookup fails (fail closed)", async () => {
    mockUserFind.mockRejectedValue(DB_DOWN);

    await expect(verifySessionToken(liveToken())).rejects.toBe(DB_DOWN);
  });

  it("returns null when the user no longer exists", async () => {
    mockUserFind.mockResolvedValue(null);

    await expect(verifySessionToken(liveToken())).resolves.toBeNull();
  });

  it("takes the role from the database, not from the token", async () => {
    mockUserFind.mockResolvedValue({ role: "USER", sessionVersion: 0 });

    const token = await verifySessionToken(liveToken({ role: "ADMIN" }));

    expect(token?.role).toBe("USER");
  });

  it("refreshes nothing but the role", async () => {
    // A row that differs in every claim: only what the guard selects counts.
    mockUserFind.mockResolvedValue({
      role: "PRO_USER",
      sessionVersion: 0,
      name: "Renamed",
      email: "renamed@example.com",
      emailVerified: new Date(),
      twoFactorEnabled: true,
    });

    const token = await verifySessionToken(liveToken());

    expect(token).toMatchObject({
      role: "PRO_USER",
      name: "Alice",
      email: "alice@example.com",
      emailVerified: null,
      twoFactorEnabled: false,
    });
  });

  it("returns null when the user's session version moved on", async () => {
    mockUserFind.mockResolvedValue({ role: "USER", sessionVersion: 1 });

    await expect(verifySessionToken(liveToken({ sv: 0 }))).resolves.toBeNull();
  });

  it("returns the token when the session version is the user's", async () => {
    mockUserFind.mockResolvedValue({ role: "USER", sessionVersion: 3 });
    const token = liveToken({ sv: 3 });

    await expect(verifySessionToken(token)).resolves.toBe(token);
  });

  it("returns null without a database call for a token that has no sv", async () => {
    await expect(verifySessionToken(tokenWithout("sv"))).resolves.toBeNull();

    expect(databaseCalls()).toBe(0);
  });
});

describe("readSessionVersion", () => {
  it("returns the stored version", async () => {
    mockUserFind.mockResolvedValue({ sessionVersion: 4 });

    await expect(readSessionVersion("user-1")).resolves.toBe(4);

    expect(mockUserFind).toHaveBeenCalledTimes(1);
    expect(mockUserFind).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { sessionVersion: true },
    });
  });

  it("throws when the user does not exist", async () => {
    mockUserFind.mockResolvedValue(null);

    await expect(readSessionVersion("ghost")).rejects.toThrow(
      "Cannot start a session for a user that does not exist",
    );
  });
});

describe("revokeSession", () => {
  const now = new Date("2026-10-02T12:00:00.000Z");
  const nowSeconds = now.getTime() / 1000;
  const graceMs = REVOCATION_GRACE_SECONDS * 1000;

  // The longest lifetime a token can have, whatever SESSION_MAX_AGE is now: a
  // copy minted before the lifetime was lowered still carries the old exp.
  it("stores the sid until now + the longest allowed lifetime + grace when the token expires earlier", async () => {
    await revokeSession(liveToken({ exp: nowSeconds + 60 }), now);

    expect(mockRevokedCreate).toHaveBeenCalledTimes(1);
    expect(mockRevokedCreate).toHaveBeenCalledWith({
      data: [
        {
          sid: "sid-1",
          expires: new Date(
            now.getTime() + MAX_SESSION_MAX_AGE_SECONDS * 1000 + graceMs,
          ),
        },
      ],
      skipDuplicates: true,
    });
  });

  it("stores the sid until exp + grace when the token expires later", async () => {
    const exp = nowSeconds + MAX_SESSION_MAX_AGE_SECONDS + 3600;

    await revokeSession(liveToken({ exp }), now);

    expect(mockRevokedCreate).toHaveBeenCalledWith({
      data: [{ sid: "sid-1", expires: new Date(exp * 1000 + graceMs) }],
      skipDuplicates: true,
    });
  });

  it("does not follow SESSION_MAX_AGE: a lowered lifetime must not shorten the row", async () => {
    process.env.SESSION_MAX_AGE = "600";

    await revokeSession(liveToken({ exp: nowSeconds + 60 }), now);

    expect(mockRevokedCreate.mock.calls[0][0].data[0].expires).toEqual(
      new Date(now.getTime() + MAX_SESSION_MAX_AGE_SECONDS * 1000 + graceMs),
    );
  });

  it.each([
    ["no token", null],
    ["an undefined token", undefined],
    ["a token without sid", tokenWithout("sid")],
  ])("does nothing for %s", async (_label, token) => {
    await expect(revokeSession(token, now)).resolves.toBeUndefined();

    expect(databaseCalls()).toBe(0);
  });

  it("deletes the expired rows after the insert", async () => {
    await revokeSession(liveToken(), now);

    expect(mockRevokedDelete).toHaveBeenCalledTimes(1);
    expect(mockRevokedDelete).toHaveBeenCalledWith({
      where: { expires: { lt: now } },
    });
    expect(mockRevokedDelete.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockRevokedCreate.mock.invocationCallOrder[0],
    );
  });

  it("still resolves when the cleanup fails, and logs it once", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRevokedDelete.mockRejectedValue(DB_DOWN);

    await expect(revokeSession(liveToken(), now)).resolves.toBeUndefined();

    expect(mockRevokedCreate).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "Could not delete expired session revocations:",
      DB_DOWN,
    );
  });

  it("rejects when the insert fails", async () => {
    mockRevokedCreate.mockRejectedValue(DB_DOWN);

    await expect(revokeSession(liveToken(), now)).rejects.toBe(DB_DOWN);

    expect(mockRevokedDelete).not.toHaveBeenCalled();
  });
});

describe("createVerifiedDecode", () => {
  const params = { token: "encrypted", secret: "secret", salt: "salt" };

  it("forwards the parameters and returns the verified token", async () => {
    const token = liveToken();
    const baseDecode = jest.fn().mockResolvedValue(token);

    await expect(createVerifiedDecode(baseDecode)(params)).resolves.toBe(token);

    expect(baseDecode).toHaveBeenCalledTimes(1);
    expect(baseDecode).toHaveBeenCalledWith(params);
    expect(databaseCalls()).toBe(2);
  });

  it("answers null without a database call when the base decode does", async () => {
    const baseDecode = jest.fn().mockResolvedValue(null);

    await expect(createVerifiedDecode(baseDecode)(params)).resolves.toBeNull();

    expect(databaseCalls()).toBe(0);
  });

  it("answers null for a revoked session", async () => {
    mockRevokedFind.mockResolvedValue({ sid: "sid-1" });
    const baseDecode = jest.fn().mockResolvedValue(liveToken());

    await expect(createVerifiedDecode(baseDecode)(params)).resolves.toBeNull();
  });

  it("rejects like the base decode for an expired or forged token", async () => {
    const invalid = new Error("JWTExpired");
    const baseDecode = jest.fn().mockRejectedValue(invalid);

    await expect(createVerifiedDecode(baseDecode)(params)).rejects.toBe(
      invalid,
    );

    expect(databaseCalls()).toBe(0);
  });
});

describe("newSessionId", () => {
  it("returns a new UUID on every call", () => {
    const first = newSessionId();
    const second = newSessionId();

    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(second).not.toBe(first);
  });
});
