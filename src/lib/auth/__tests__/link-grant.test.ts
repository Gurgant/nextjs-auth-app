/**
 * @jest-environment node
 */

/**
 * The two statements of a link grant (src/lib/auth/link-grant.ts), by their
 * shape. A grant can be used once because the spend is ONE conditional
 * UPDATE: rewritten as a read followed by a write, or with a relation in its
 * filter, it would still pass every test that runs one call at a time. What
 * PostgreSQL makes of the statement when two calls overlap is measured by the
 * integration test (docs/TESTING.md).
 */

// Every model and every method exists on this Prisma client and is recorded,
// so a statement that a function is not expected to send shows up in
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

import fs from "fs";
import path from "path";
import {
  LINK_GRANT_TTL_SECONDS,
  issueLinkGrant,
  spendLinkGrant,
} from "@/lib/auth/link-grant";

/** The calls the functions made on the Prisma client, in order. */
const mockPrismaCalls: { name: string; args: unknown }[] = [];
/** How many rows prisma.user.updateMany says it changed. */
let mockRowsChanged = 1;

function mockPrismaCall(name: string, args: unknown): Promise<unknown> {
  mockPrismaCalls.push({ name, args });
  return Promise.resolve(
    name === "user.updateMany" ? { count: mockRowsChanged } : { id: "a-row" },
  );
}

const NOW = new Date("2026-10-05T12:00:00.000Z");

beforeEach(() => {
  mockPrismaCalls.length = 0;
  mockRowsChanged = 1;
});

describe("issueLinkGrant", () => {
  it("writes the provider and an end 300 seconds later on the user's row, in one update", async () => {
    expect(LINK_GRANT_TTL_SECONDS).toBe(300);

    await expect(
      issueLinkGrant("user-1", "google", NOW),
    ).resolves.toBeUndefined();

    expect(mockPrismaCalls).toStrictEqual([
      {
        name: "user.update",
        args: {
          where: { id: "user-1" },
          data: {
            linkGrantProvider: "google",
            linkGrantExpiresAt: new Date("2026-10-05T12:05:00.000Z"),
          },
        },
      },
    ]);
  });

  it("counts from the moment of the call when it is given no time", async () => {
    const before = Date.now();
    await issueLinkGrant("user-1", "google");
    const after = Date.now();

    const { data } = mockPrismaCalls[0].args as {
      data: { linkGrantExpiresAt: Date };
    };
    const end = data.linkGrantExpiresAt.getTime();
    expect(end).toBeGreaterThanOrEqual(before + 300_000);
    expect(end).toBeLessThanOrEqual(after + 300_000);
  });

  // The password step writes the grant and its event in one transaction.
  it("writes through the client it is handed, and not through the application's", async () => {
    const update = jest.fn().mockResolvedValue({ id: "a-row" });
    // A client with this one method: any other call on it would throw.
    const transaction = { user: { update } } as unknown as Parameters<
      typeof issueLinkGrant
    >[3];

    await issueLinkGrant("user-1", "google", NOW, transaction);

    expect(update.mock.calls).toStrictEqual([
      [
        {
          where: { id: "user-1" },
          data: {
            linkGrantProvider: "google",
            linkGrantExpiresAt: new Date("2026-10-05T12:05:00.000Z"),
          },
        },
      ],
    ]);
    expect(mockPrismaCalls).toEqual([]);
  });
});

describe("spendLinkGrant", () => {
  it("sends one conditional update, on columns of the user row only, and nothing else", async () => {
    await spendLinkGrant("user-1", "google", NOW);

    // toStrictEqual: one more key in the filter (a relation), or a read
    // before the update, fails here.
    expect(mockPrismaCalls).toStrictEqual([
      {
        name: "user.updateMany",
        args: {
          where: {
            id: "user-1",
            linkGrantProvider: "google",
            linkGrantExpiresAt: { gt: NOW },
          },
          data: { linkGrantProvider: null, linkGrantExpiresAt: null },
        },
      },
    ]);
  });

  it("answers true when the update changed the row", async () => {
    mockRowsChanged = 1;

    await expect(spendLinkGrant("user-1", "google", NOW)).resolves.toBe(true);
  });

  it("answers false when the update changed nothing", async () => {
    mockRowsChanged = 0;

    await expect(spendLinkGrant("user-1", "google", NOW)).resolves.toBe(false);
  });

  it("compares the end with the moment of the call when it is given no time", async () => {
    const before = Date.now();
    await spendLinkGrant("user-1", "google");
    const after = Date.now();

    const { where } = mockPrismaCalls[0].args as {
      where: { linkGrantExpiresAt: { gt: Date } };
    };
    const compared = where.linkGrantExpiresAt.gt.getTime();
    expect(compared).toBeGreaterThanOrEqual(before);
    expect(compared).toBeLessThanOrEqual(after);
  });
});

// The refusal page tells the visitor how long the Google step may take
// (src/app/[locale]/auth/error/page.tsx, case "LinkNotConfirmed").
describe("the refusal texts", () => {
  const MESSAGES_DIRECTORY = path.resolve(__dirname, "../../../../messages");
  const minutes = String(LINK_GRANT_TTL_SECONDS / 60);

  it.each(["en", "es", "fr", "it", "de"])(
    "messages/%s.json has the three texts, and the details name the minutes of a grant",
    (locale) => {
      const { Auth } = JSON.parse(
        fs.readFileSync(
          path.join(MESSAGES_DIRECTORY, `${locale}.json`),
          "utf8",
        ),
      ) as { Auth: { error: Record<string, string | undefined> } };

      for (const key of [
        "linkNotConfirmed",
        "linkNotConfirmedDescription",
        "linkNotConfirmedDetails",
      ]) {
        expect(Auth.error[key]?.trim()).toBeTruthy();
      }
      expect(Auth.error.linkNotConfirmedDetails).toMatch(
        new RegExp(`(?<!\\d)${minutes}(?!\\d)`),
      );
    },
  );
});
