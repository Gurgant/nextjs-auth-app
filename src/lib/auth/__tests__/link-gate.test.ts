/**
 * @jest-environment node
 */

/**
 * The decision of the link gate (src/lib/auth/link-gate.ts), case by case:
 * which user rows are linked without a grant, which need one, what a refusal
 * leaves behind, and that the gate replaces `linkAccount` and nothing else.
 *
 * The Prisma client is a recording stand-in and the adapter under the gate is
 * a fake, so every read, every write and the link itself show up in one
 * list, in order. The same decisions are measured on real PostgreSQL by the
 * integration test.
 */

// Every model and every method exists on this Prisma client and is recorded.
jest.mock("@/lib/prisma", () => {
  const delegate = (model: string) =>
    new Proxy(
      {},
      {
        get: (_target, method) => (args: unknown) =>
          mockCall(`${model}.${String(method)}`, args),
      },
    );
  return {
    prisma: new Proxy({}, { get: (_target, model) => delegate(String(model)) }),
  };
});
jest.mock("@/lib/auth/link-refusal", () => ({ noteLinkRefusal: jest.fn() }));

import type { Adapter, AdapterAccount } from "next-auth/adapters";
import { LinkNotConfirmedError, withLinkGate } from "@/lib/auth/link-gate";
import { noteLinkRefusal } from "@/lib/auth/link-refusal";

const mockNoteLinkRefusal = noteLinkRefusal as jest.Mock;

/** The Prisma calls of the gate and the link of the adapter under it, in order. */
const mockCalls: { name: string; args: unknown }[] = [];
/** What prisma.user.findUnique answers: a row, or null. */
let mockUserRow: unknown = null;
/** How many rows the spend of the grant (prisma.user.updateMany) changed. */
let mockGrantsSpent = 0;
/** The one call that fails, when a test names one. */
let mockFailingCall: string | null = null;

function mockCall(name: string, args: unknown): Promise<unknown> {
  mockCalls.push({ name, args });
  if (name === mockFailingCall) {
    return Promise.reject(new Error(`${name} failed`));
  }
  if (name === "user.findUnique") return Promise.resolve(mockUserRow);
  if (name === "user.updateMany") {
    return Promise.resolve({ count: mockGrantsSpent });
  }
  return Promise.resolve({ id: "a-row" });
}

const USER_ID = "user-1";
/** What the application stores of an account: whose it is. */
const IDENTITY = {
  userId: USER_ID,
  type: "oidc",
  provider: "google",
  providerAccountId: "google-subject-1",
};
/**
 * The account as Auth.js hands it over: the identity and the seven values it
 * takes from the provider's token response (@auth/core lib/utils/providers.js).
 */
const googleAccount: AdapterAccount = {
  userId: USER_ID,
  type: "oidc",
  provider: "google",
  providerAccountId: "google-subject-1",
  access_token: "access-token-from-google",
  refresh_token: "refresh-token-from-google",
  id_token: "id-token-from-google",
  expires_at: 1_800_000_000,
  token_type: "bearer",
  scope: "openid profile email",
  session_state: "session-state-from-google",
};
const LINK_IDENTITY = { name: "base.linkAccount", args: IDENTITY };

/** The columns the gate reads. By default: a user with a password. */
const userRow = (over: Record<string, unknown> = {}) => ({
  password: "a-bcrypt-hash",
  emailVerified: null,
  accounts: [{ provider: "credentials" }],
  ...over,
});

const getUser = jest.fn();
const createUser = jest.fn();
/** The adapter under the gate: its link is recorded with the Prisma calls. */
const base: Adapter = {
  getUser,
  createUser,
  linkAccount: async (account: AdapterAccount): Promise<void> => {
    await mockCall("base.linkAccount", account);
  },
};

const link = (account: AdapterAccount = googleAccount) =>
  withLinkGate(base).linkAccount(account);

const callNames = () => mockCalls.map((call) => call.name);

const READ_USER = {
  name: "user.findUnique",
  args: {
    where: { id: USER_ID },
    select: {
      password: true,
      emailVerified: true,
      accounts: { select: { provider: true } },
    },
  },
};
const SPEND_GRANT = {
  name: "user.updateMany",
  args: {
    where: {
      id: USER_ID,
      linkGrantProvider: "google",
      linkGrantExpiresAt: { gt: expect.any(Date) },
    },
    data: { linkGrantProvider: null, linkGrantExpiresAt: null },
  },
};
const refusedEvent = (reason: string) => ({
  name: "securityEvent.create",
  args: {
    data: {
      userId: USER_ID,
      eventType: "account_link_refused",
      details: `Refused to link a google account: ${reason}`,
      metadata: { provider: "google", reason },
      ipAddress: undefined,
      userAgent: undefined,
      success: false,
    },
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCalls.length = 0;
  mockUserRow = userRow();
  mockGrantsSpent = 0;
  mockFailingCall = null;
});

describe("a first sign-in: the row Auth.js has just created", () => {
  it("is linked without a grant, and without an event", async () => {
    mockUserRow = userRow({ password: null, accounts: [] });

    await expect(link()).resolves.toBeUndefined();

    // Whose account it is, and none of the tokens Auth.js handed over.
    expect(mockCalls).toStrictEqual([READ_USER, LINK_IDENTITY]);
    expect(mockNoteLinkRefusal).not.toHaveBeenCalled();
  });

  // One condition of the three left out at a time: the row needs a grant.
  it.each([
    ["has a password", userRow({ accounts: [] })],
    [
      "has a verified e-mail",
      userRow({ password: null, emailVerified: new Date(0), accounts: [] }),
    ],
    [
      "has an Account row of another provider",
      userRow({ password: null, accounts: [{ provider: "credentials" }] }),
    ],
    [
      "has an Account row of this provider",
      userRow({ password: null, accounts: [{ provider: "google" }] }),
    ],
  ])("is not what a row is taken for when it %s", async (_, row) => {
    mockUserRow = row;

    await expect(link()).rejects.toMatchObject({ reason: "no_grant" });

    expect(mockCalls).toStrictEqual([
      READ_USER,
      SPEND_GRANT,
      refusedEvent("no_grant"),
    ]);
  });
});

describe("a user that is not new", () => {
  it("is linked after the grant was spent, and the link is recorded", async () => {
    mockGrantsSpent = 1;

    await expect(link()).resolves.toBeUndefined();

    expect(mockCalls).toStrictEqual([
      READ_USER,
      SPEND_GRANT,
      LINK_IDENTITY,
      {
        name: "securityEvent.create",
        args: {
          data: {
            userId: USER_ID,
            eventType: "account_link_completed",
            details: "Linked a google account after the password check",
            metadata: {
              provider: "google",
              providerAccountId: "google-subject-1",
            },
            ipAddress: undefined,
            userAgent: undefined,
            success: true,
          },
        },
      },
    ]);
    expect(mockNoteLinkRefusal).not.toHaveBeenCalled();
  });

  it("is refused without a grant: nothing is linked, the refusal is noted for the page and recorded", async () => {
    mockGrantsSpent = 0;

    const refusal = await link().catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(LinkNotConfirmedError);
    expect(refusal).toMatchObject({
      name: "LinkNotConfirmedError",
      reason: "no_grant",
      message: "Account link refused: no_grant",
    });
    expect(mockCalls).toStrictEqual([
      READ_USER,
      SPEND_GRANT,
      refusedEvent("no_grant"),
    ]);
    expect(mockNoteLinkRefusal).toHaveBeenCalledTimes(1);
  });

  it("is refused when the user already has an account of the provider, and the grant is used up", async () => {
    mockUserRow = userRow({
      accounts: [{ provider: "credentials" }, { provider: "google" }],
    });
    mockGrantsSpent = 1;

    await expect(link()).rejects.toMatchObject({
      name: "LinkNotConfirmedError",
      reason: "already_linked",
    });

    expect(mockCalls).toStrictEqual([
      READ_USER,
      SPEND_GRANT,
      refusedEvent("already_linked"),
    ]);
    expect(mockNoteLinkRefusal).toHaveBeenCalledTimes(1);
  });

  it("asks for a grant of the provider of the account, not of Google as such", async () => {
    mockGrantsSpent = 0;

    await expect(
      link({ ...googleAccount, provider: "github" }),
    ).rejects.toMatchObject({ reason: "no_grant" });

    expect(mockCalls[1]).toMatchObject({
      name: "user.updateMany",
      args: { where: { id: USER_ID, linkGrantProvider: "github" } },
    });
  });
});

describe("what is stored of the account", () => {
  // The two cases that end in a link: the row of a first sign-in, and a user
  // with a grant.
  it.each([
    ["a first sign-in", userRow({ password: null, accounts: [] }), 0],
    ["a link after the password step", userRow(), 1],
  ])(
    "%s: the adapter is handed whose account it is, and nothing else Auth.js handed over",
    async (_, row, grantsSpent) => {
      mockUserRow = row;
      mockGrantsSpent = grantsSpent;
      // A provider can answer with more than the seven values, and its
      // `account` callback can pass that on.
      const handedOver: AdapterAccount = {
        ...googleAccount,
        refresh_token_expires_in: 15_552_000,
      };
      const asHandedOver = { ...handedOver };

      await link(handedOver);

      expect(
        mockCalls.filter((call) => call.name === "base.linkAccount"),
      ).toStrictEqual([LINK_IDENTITY]);
      // The object Auth.js handed over is left as it was.
      expect(handedOver).toStrictEqual(asHandedOver);
    },
  );
});

describe("a user id that no row has", () => {
  it("is refused before a grant is looked for, with no event (there is no row to hang it on)", async () => {
    mockUserRow = null;

    await expect(link()).rejects.toMatchObject({
      name: "LinkNotConfirmedError",
      reason: "user_not_found",
    });

    expect(mockCalls).toStrictEqual([READ_USER]);
    expect(mockNoteLinkRefusal).toHaveBeenCalledTimes(1);
  });
});

describe("when something fails", () => {
  it.each(["user.findUnique", "user.updateMany"])(
    "a failing %s is the error of the link, and nothing is linked",
    async (call) => {
      mockGrantsSpent = 1;
      mockFailingCall = call;

      const failure = await link().catch((error: unknown) => error);

      expect(failure).toEqual(new Error(`${call} failed`));
      expect(failure).not.toBeInstanceOf(LinkNotConfirmedError);
      expect(callNames()).not.toContain("base.linkAccount");
      expect(callNames()).not.toContain("securityEvent.create");
    },
  );

  it("a link that fails after the grant was spent is the error of the link, and no completed event is written", async () => {
    mockGrantsSpent = 1;
    mockFailingCall = "base.linkAccount";

    await expect(link()).rejects.toEqual(new Error("base.linkAccount failed"));

    expect(callNames()).toEqual([
      "user.findUnique",
      "user.updateMany",
      "base.linkAccount",
    ]);
  });

  it("an event that cannot be written changes neither a refusal nor a link", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    mockFailingCall = "securityEvent.create";

    mockGrantsSpent = 0;
    await expect(link()).rejects.toBeInstanceOf(LinkNotConfirmedError);
    mockGrantsSpent = 1;
    await expect(link()).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledTimes(2);
    logged.mockRestore();
  });
});

describe("the adapter the gate returns", () => {
  it("has linkAccount as a key of its own and every other method as it was", () => {
    const gated = withLinkGate(base);

    // Auth.js wraps the adapter key by key (@auth/core lib/init.js).
    expect(Object.keys(gated).sort()).toEqual([
      "createUser",
      "getUser",
      "linkAccount",
    ]);
    expect(gated.getUser).toBe(getUser);
    expect(gated.createUser).toBe(createUser);
    expect(gated.linkAccount).not.toBe(base.linkAccount);
  });

  it("can be built around an adapter that cannot link, and refuses with a plain error when asked to", async () => {
    // The auth-config unit tests load the configuration with such an adapter.
    const gated = withLinkGate({});

    const failure = await gated
      .linkAccount(googleAccount)
      .catch((error: unknown) => error);

    expect(failure).toEqual(new Error("The adapter cannot link accounts"));
    expect(failure).not.toBeInstanceOf(LinkNotConfirmedError);
    expect(mockCalls).toEqual([]);
  });
});
