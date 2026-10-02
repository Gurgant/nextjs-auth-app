/**
 * @jest-environment node
 */

/**
 * What the Auth.js configuration does for revocable sessions: the session id
 * and the user's session version are put into the token once, at sign-in (the
 * version is the one of the row the password was checked against); the
 * `signOut` event revokes the session; the session id never reaches the
 * session object. The guard itself is mocked (it has its own test).
 */

jest.mock("next-auth", () => {
  class CredentialsSignin extends Error {
    code = "credentials";
  }
  return { __esModule: true, CredentialsSignin };
});
jest.mock("next-auth/providers/credentials", () => ({
  __esModule: true,
  default: (options: unknown) => ({ id: "credentials", options }),
}));
jest.mock("next-auth/providers/google", () => ({
  __esModule: true,
  default: (options: unknown) => ({ id: "google", options }),
}));
jest.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/repositories", () => ({
  repositories: { getUserRepository: () => mockRepo },
}));
jest.mock("@/lib/auth/remember-login-method", () => ({
  rememberLoginMethod: jest.fn(),
}));
jest.mock("@/lib/auth/session-revocation", () => ({
  newSessionId: jest.fn(),
  readSessionVersion: jest.fn(),
  revokeSession: jest.fn(),
}));

import { authOptions } from "@/lib/auth-config";
import {
  newSessionId,
  readSessionVersion,
  revokeSession,
} from "@/lib/auth/session-revocation";

const mockRepo = {
  verifyCredentials: jest.fn(),
  recordSuccessfulLogin: jest.fn(),
};
const mockNewSessionId = newSessionId as jest.Mock;
const mockReadSessionVersion = readSessionVersion as jest.Mock;
const mockRevokeSession = revokeSession as jest.Mock;

type Claims = Record<string, unknown>;
type JwtCallback = (params: {
  token: Claims;
  user?: Claims;
}) => Promise<Claims>;
type SessionCallback = (params: {
  session: { user: Claims; expires: string };
  token: Claims;
}) => Promise<unknown>;
type SignOutEvent = (message: { token: Claims | null }) => Promise<void>;
type Authorize = (credentials: Record<string, unknown>) => Promise<Claims>;

const jwtCallback = authOptions.callbacks.jwt as unknown as JwtCallback;
const sessionCallback = authOptions.callbacks
  .session as unknown as SessionCallback;
const signOutEvent = authOptions.events.signOut as unknown as SignOutEvent;
const credentialsProvider = authOptions.providers.find(
  (provider) => provider.id === "credentials",
) as unknown as { options: { authorize: Authorize } };
const authorize = credentialsProvider.options.authorize;

const SID = "3f0c2a9e-0000-4000-8000-000000000001";
const user = {
  id: "u1",
  email: "alice@example.com",
  name: "Alice",
  image: null,
  emailVerified: null,
  twoFactorEnabled: false,
  role: "ADMIN",
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  mockNewSessionId.mockReturnValue(SID);
  mockReadSessionVersion.mockResolvedValue(7);
  mockRevokeSession.mockResolvedValue(undefined);
});

afterEach(() => jest.restoreAllMocks());

describe("jwt callback", () => {
  it("gives a new session its id at sign-in, next to the user's claims", async () => {
    const token = await jwtCallback({ token: { sub: "u1" }, user });

    expect(token.sid).toBe(SID);
    expect(mockNewSessionId).toHaveBeenCalledTimes(1);
    expect(token).toMatchObject({
      id: "u1",
      email: "alice@example.com",
      role: "ADMIN",
    });
  });

  it("takes the session version from the user object, without a lookup", async () => {
    const token = await jwtCallback({
      token: { sub: "u1" },
      user: { ...user, sessionVersion: 0 },
    });

    expect(token.sv).toBe(0);
    expect(mockReadSessionVersion).not.toHaveBeenCalled();
  });

  it("reads the session version from the database when the user object carries none", async () => {
    const token = await jwtCallback({ token: { sub: "u1" }, user });

    expect(token.sv).toBe(7);
    expect(mockReadSessionVersion).toHaveBeenCalledTimes(1);
    expect(mockReadSessionVersion).toHaveBeenCalledWith("u1");
  });

  it("a credentials sign-in carries the version of the row its password was checked against", async () => {
    mockRepo.verifyCredentials.mockResolvedValue({
      status: "valid",
      user: { ...user, password: "stored-hash", sessionVersion: 3 },
    });
    mockRepo.recordSuccessfulLogin.mockResolvedValue(undefined);

    const authorized = await authorize({
      email: "alice@example.com",
      password: "Password123!",
    });
    // The password changes between the credential check and the token: the
    // database is now one version ahead of the row that was checked.
    mockReadSessionVersion.mockResolvedValue(4);
    const token = await jwtCallback({ token: { sub: "u1" }, user: authorized });

    expect(token.sv).toBe(3);
    expect(authorized.sessionVersion).toBe(3);
    expect(mockReadSessionVersion).not.toHaveBeenCalled();
  });

  it("returns the token unchanged on a session check: no new id, no lookup", async () => {
    const existing = { sub: "u1", id: "u1", sid: "kept", sv: 2, role: "USER" };

    const token = await jwtCallback({ token: existing });

    expect(token).toBe(existing);
    expect(token).toEqual({
      sub: "u1",
      id: "u1",
      sid: "kept",
      sv: 2,
      role: "USER",
    });
    expect(mockNewSessionId).not.toHaveBeenCalled();
    expect(mockReadSessionVersion).not.toHaveBeenCalled();
  });
});

describe("signOut event", () => {
  it("revokes the session of the token it is given", async () => {
    const token = { sub: "u1", id: "u1", sid: SID };

    await signOutEvent({ token });

    expect(mockRevokeSession).toHaveBeenCalledTimes(1);
    expect(mockRevokeSession).toHaveBeenCalledWith(token);
  });

  it("waits for the revocation: a failed write rejects the event", async () => {
    const failure = new Error("insert failed");
    mockRevokeSession.mockRejectedValue(failure);

    await expect(
      signOutEvent({ token: { sub: "u1", id: "u1", sid: SID } }),
    ).rejects.toBe(failure);
  });

  it("resolves when the cookie could not be decoded (token null)", async () => {
    await expect(signOutEvent({ token: null })).resolves.toBeUndefined();
  });
});

describe("session callback", () => {
  it("does not expose the session id or the session version", async () => {
    const session = await sessionCallback({
      session: { user: {}, expires: "2026-10-09T00:00:00.000Z" },
      token: { ...user, sub: "u1", sid: SID, sv: 7 },
    });

    const json = JSON.stringify(session);
    // The claims the callback copies are there, so the search below can find.
    expect(json).toContain("alice@example.com");
    expect(json).not.toContain(SID);
    expect(json).not.toContain('"sid"');
    expect(json).not.toContain('"sv"');
  });
});
