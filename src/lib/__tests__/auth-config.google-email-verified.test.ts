/**
 * @jest-environment node
 */

/**
 * A Google sign-in marks the e-mail verified only when Google's ID token says
 * `email_verified: true` for the address stored on the user. That is decided
 * in one place, the `jwt` callback: it runs after Auth.js accepted the sign-in
 * and before the session token is encoded. The `signIn` callback and the
 * `createUser` event never write `emailVerified`.
 *
 * The handlers get the arguments @auth/core 0.41.3 passes them
 * (lib/actions/callback/index.js:63-67 for `signIn`, :78-85 for `jwt`). The
 * `user` of the `jwt` callback is the one handle-login.js returns: the
 * existing row (:199), the signed-in user when linking (:212) or the row just
 * created with `emailVerified: null` (:260).
 *
 * The repository is mocked. next-auth, its providers and the Prisma adapter
 * are ESM packages that next/jest does not transform, so they are replaced
 * with minimal stand-ins.
 */

jest.mock("next-auth", () => {
  class CredentialsSignin extends Error {
    code = "credentials";
  }
  return { __esModule: true, CredentialsSignin };
});
jest.mock("next-auth/providers/credentials", () => ({
  __esModule: true,
  default: (options: unknown) => ({
    id: "credentials",
    type: "credentials",
    options,
  }),
}));
jest.mock("next-auth/providers/google", () => ({
  __esModule: true,
  default: () => ({ id: "google", type: "oidc" }),
}));
jest.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));

const mockRepo = {
  findByEmailWithAccounts: jest.fn(),
  update: jest.fn(),
};

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/repositories", () => ({
  repositories: { getUserRepository: () => mockRepo },
}));
jest.mock("@/lib/auth/remember-login-method", () => ({
  rememberLoginMethod: jest.fn(),
}));
// The session claims the jwt callback also sets are covered by
// auth-config.session.test.ts; here they need no database.
jest.mock("@/lib/auth/session-revocation", () => ({
  newSessionId: () => "sid",
  readSessionVersion: async () => 0,
  revokeSession: async () => {},
}));

import { authOptions } from "@/lib/auth-config";

type Fields = Record<string, unknown>;
type JwtCallback = (params: {
  token: Fields;
  user?: Fields;
  account?: Fields | null;
  profile?: Fields;
  isNewUser?: boolean;
  trigger?: "signIn" | "signUp" | "update";
}) => Promise<Fields>;
type SignInCallback = (params: {
  user: Fields;
  account?: Fields | null;
  profile?: Fields;
}) => Promise<boolean>;
type CreateUserEvent = (message: {
  user: Fields;
  account?: Fields;
}) => Promise<void>;

const jwt = authOptions.callbacks.jwt as unknown as JwtCallback;
const signIn = authOptions.callbacks.signIn as unknown as SignInCallback;
const createUserEvent = authOptions.events
  .createUser as unknown as CreateUserEvent;

const VERIFIED_BEFORE = new Date("2025-03-04T05:06:07.000Z");
const googleAccount = {
  provider: "google",
  type: "oidc",
  providerAccountId: "g1",
};
const credentialsAccount = {
  provider: "credentials",
  type: "credentials",
  providerAccountId: "u1",
};

/** The user Auth.js resolved the sign-in to (a row read through the adapter). */
const signedInUser = (over: Fields = {}): Fields => ({
  id: "u1",
  name: "Ada",
  email: "a@example.com",
  image: null,
  emailVerified: null,
  role: "USER",
  twoFactorEnabled: false,
  ...over,
});

/** The claims of Google's ID token. */
const idToken = (over: Fields = {}): Fields => ({
  sub: "g1",
  email: "a@example.com",
  email_verified: true,
  ...over,
});

/** The row the `signIn` callback looks up by the Google address. */
const storedUser = (over: Fields = {}): Fields => ({
  id: "u1",
  email: "a@example.com",
  password: null,
  emailVerified: null,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  passwordSetAt: null,
  lastPasswordChange: null,
  accounts: [{ provider: "google" }],
  ...over,
});

/** What Auth.js builds from the Google profile before a user is resolved. */
const userFromGoogle = (email: string): Fields => ({
  id: "0b0e7a52-6f0c-4c8e-9d43-2f1f7f0f3a11",
  name: "Ada",
  email,
  image: "https://example.com/ada.png",
});

/** The `jwt` callback as Auth.js calls it right after a sign-in. */
function jwtAfterSignIn(
  user: Fields,
  rest: { account?: Fields; profile?: Fields; isNewUser?: boolean } = {},
): Promise<Fields> {
  const { account = googleAccount, profile, isNewUser = false } = rest;
  return jwt({
    token: {
      name: user.name,
      email: user.email,
      picture: user.image,
      sub: user.id,
    },
    user,
    account,
    profile,
    isNewUser,
    trigger: isNewUser ? "signUp" : "signIn",
  });
}

/** The data of every repository update, in call order. */
const writtenData = (): Fields[] =>
  mockRepo.update.mock.calls.map(([, data]) => data);

beforeEach(() => {
  jest.resetAllMocks();
  mockRepo.update.mockResolvedValue({});
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("jwt callback: Google reports the stored address as verified", () => {
  it("verifies a new Google user at the first sign-in, in the database and in the token", async () => {
    const user = signedInUser({ email: "new@example.com" });

    const token = await jwtAfterSignIn(user, {
      profile: idToken({ email: "New@Example.com" }),
      isNewUser: true,
    });

    expect(mockRepo.update).toHaveBeenCalledTimes(1);
    expect(mockRepo.update).toHaveBeenCalledWith("u1", {
      emailVerified: expect.any(Date),
    });
    expect(token.emailVerified).toBe(writtenData()[0].emailVerified);
  });

  it("verifies an existing Google user who is still unverified", async () => {
    const token = await jwtAfterSignIn(signedInUser(), { profile: idToken() });

    expect(mockRepo.update).toHaveBeenCalledTimes(1);
    expect(mockRepo.update).toHaveBeenCalledWith("u1", {
      emailVerified: expect.any(Date),
    });
    expect(token.emailVerified).toBe(writtenData()[0].emailVerified);
  });

  it("verifies the signed-in user who links a Google account with the same address", async () => {
    const user = signedInUser({ id: "u7", email: "link@example.com" });

    const token = await jwtAfterSignIn(user, {
      profile: idToken({ sub: "g7", email: "link@example.com" }),
    });

    expect(mockRepo.update).toHaveBeenCalledTimes(1);
    expect(mockRepo.update).toHaveBeenCalledWith("u7", {
      emailVerified: expect.any(Date),
    });
    expect(token.emailVerified).toBe(writtenData()[0].emailVerified);
  });

  it("keeps the first verification date of an already verified user", async () => {
    const token = await jwtAfterSignIn(
      signedInUser({ emailVerified: VERIFIED_BEFORE }),
      { profile: idToken() },
    );

    expect(mockRepo.update).not.toHaveBeenCalled();
    expect(token.emailVerified).toBe(VERIFIED_BEFORE);
  });

  it("does not fail the sign-in when the date cannot be stored", async () => {
    mockRepo.update.mockRejectedValue(new Error("connection refused"));

    const token = await jwtAfterSignIn(signedInUser(), { profile: idToken() });

    expect(token.id).toBe("u1");
    expect(token.emailVerified).toBeNull();
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});

describe("jwt callback: nothing vouches for the stored address", () => {
  it.each([
    ["is false", idToken({ email_verified: false })],
    ["is missing", { sub: "g1", email: "a@example.com" }],
    ['is the string "true"', idToken({ email_verified: "true" })],
  ])(
    "does not verify when Google's email_verified %s",
    async (_label, profile) => {
      const token = await jwtAfterSignIn(signedInUser(), { profile });

      expect(mockRepo.update).not.toHaveBeenCalled();
      expect(token.emailVerified).toBeNull();
    },
  );

  it("does not verify when the Google address is not the user's address", async () => {
    const token = await jwtAfterSignIn(signedInUser(), {
      profile: idToken({ email: "someone.else@example.com" }),
    });

    expect(mockRepo.update).not.toHaveBeenCalled();
    expect(token.emailVerified).toBeNull();
  });

  it("copies the stored value for a credentials sign-in", async () => {
    const token = await jwtAfterSignIn(
      signedInUser({ emailVerified: VERIFIED_BEFORE }),
      { account: credentialsAccount },
    );

    expect(mockRepo.update).not.toHaveBeenCalled();
    expect(token.emailVerified).toBe(VERIFIED_BEFORE);
  });

  it("returns the token untouched on a session read (no user)", async () => {
    const stored = {
      sub: "u1",
      id: "u1",
      email: "a@example.com",
      emailVerified: null,
      role: "USER",
      twoFactorEnabled: false,
    };
    const token = { ...stored };

    await expect(jwt({ token })).resolves.toBe(token);

    expect(token).toEqual(stored);
    expect(mockRepo.update).not.toHaveBeenCalled();
    expect(mockRepo.findByEmailWithAccounts).not.toHaveBeenCalled();
  });
});

// The `signIn` callback runs before Auth.js accepts or refuses the sign-in and
// looks the row up by the Google address, so it must not decide verification.
// Its other metadata writes are the control that the update did happen.
describe("signIn callback: writes metadata, never emailVerified", () => {
  it("for an existing Google user whose address Google does not report verified", async () => {
    mockRepo.findByEmailWithAccounts.mockResolvedValue(storedUser());

    const allowed = await signIn({
      user: signedInUser(),
      account: googleAccount,
      profile: idToken({ email_verified: false }),
    });

    expect(allowed).toBe(true);
    expect(mockRepo.update).toHaveBeenCalledTimes(1);
    expect(mockRepo.update.mock.calls[0][0]).toBe("u1");
    expect(writtenData()[0]).toMatchObject({
      hasGoogleAccount: true,
      hasEmailAccount: false,
      lastLoginAt: expect.any(Date),
    });
    expect(writtenData()[0]).not.toHaveProperty("emailVerified");
  });

  it("for a password account with the same address, which Auth.js then refuses (OAuthAccountNotLinked)", async () => {
    mockRepo.findByEmailWithAccounts.mockResolvedValue(
      storedUser({ id: "u2", password: "stored-hash", accounts: [] }),
    );

    await signIn({
      user: userFromGoogle("a@example.com"),
      account: googleAccount,
      profile: idToken(),
    });

    expect(mockRepo.update).toHaveBeenCalledTimes(1);
    expect(mockRepo.update.mock.calls[0][0]).toBe("u2");
    expect(writtenData()[0]).toMatchObject({
      hasGoogleAccount: false,
      hasEmailAccount: true,
    });
    expect(writtenData()[0]).not.toHaveProperty("emailVerified");
  });

  it("for another user who owns the Google address while someone else links it", async () => {
    mockRepo.findByEmailWithAccounts.mockResolvedValue(
      storedUser({ id: "c1", email: "c@example.com", accounts: [] }),
    );

    await signIn({
      user: userFromGoogle("c@example.com"),
      account: googleAccount,
      profile: idToken({ email: "c@example.com" }),
    });

    expect(mockRepo.findByEmailWithAccounts).toHaveBeenCalledWith(
      "c@example.com",
    );
    expect(mockRepo.update).toHaveBeenCalledTimes(1);
    expect(mockRepo.update.mock.calls[0][0]).toBe("c1");
    expect(writtenData()[0]).not.toHaveProperty("emailVerified");
  });
});

// Auth.js calls this event with `{ user }` only (handle-login.js:77, :160,
// :263), so it cannot know the provider.
describe("createUser event: never updates the user", () => {
  it("even when it is handed a Google account", async () => {
    await createUserEvent({
      user: { id: "u1" },
      account: { provider: "google" },
    });

    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it("when called the way Auth.js calls it", async () => {
    await createUserEvent({ user: { id: "u1" } });

    expect(console.log).toHaveBeenCalledWith("New user created:", {
      userId: "u1",
    });
    expect(mockRepo.update).not.toHaveBeenCalled();
  });
});
