/**
 * @jest-environment node
 *
 * The rate-limit keys that registerUser and sendEmailVerification build from
 * an e-mail address. Both count the attempt before anything validates the
 * address, and the limiter keeps every key whole, up to 20,000 of them
 * (src/lib/rate-limit.ts): so the key is bounded where it is built. It is the
 * address in lower case, cut to 254 characters, the longest address the
 * registration accepts; a value that is no text has no key.
 * The real rate limiter is used, with a recorder in front of it; the command
 * bus is spied and answers at once, Prisma finds no user.
 */
// Translations answer with the English fallback the action passes in.
jest.mock("@/lib/utils/server-translations", () => ({
  translateError: async (_locale: string, key: string, fallback?: string) =>
    fallback ?? key,
  translateSuccess: async (_locale: string, key: string, fallback?: string) =>
    fallback ?? key,
}));

const mockHeaders = jest.fn<Promise<Headers>, []>();
jest.mock("next/headers", () => ({
  headers: () => mockHeaders(),
  cookies: async () => ({ get: () => undefined }),
}));

jest.mock("@/lib/auth", () => ({
  auth: async () => null,
}));

const mockRecorded = jest.fn();
jest.mock("@/lib/rate-limit", () => {
  const actual =
    jest.requireActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return {
    ...actual,
    recordAttempt: (...args: Parameters<typeof actual.recordAttempt>) => {
      mockRecorded(...args);
      return actual.recordAttempt(...args);
    },
  };
});

const mockFindUser = jest.fn();
jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (args: unknown) => mockFindUser(args) } },
}));

jest.mock("@/lib/email", () => ({
  sendVerificationEmail: jest.fn(),
  sendSecurityAlert: jest.fn(),
}));

jest.mock("@/lib/two-factor", () => ({}));

jest.mock("@/lib/repositories", () => ({
  repositories: { getUserRepository: () => ({}) },
}));

jest.mock("@/lib/events", () => ({
  eventBus: { publish: async () => {} },
}));

import { registerUser } from "../auth";
import { sendEmailVerification } from "../advanced-auth";
import { emailRateLimitKey } from "../rate-limit-key";
import { commandBus } from "@/lib/commands";
import { RATE_LIMITS, __resetRateLimitStore } from "@/lib/rate-limit";
import { emailSchema } from "@/lib/validation";

const CLIENT_IP = "203.0.113.7";
// The longest address emailSchema accepts, and the longest key.
const MAX = 254;

/** An address of `length` characters that ends in `ending`. */
const addressOf = (length: number, ending = "@example.com") =>
  "a".repeat(length - ending.length) + ending;

function registration(email: string | Blob): FormData {
  const formData = new FormData();
  formData.set("name", "New User");
  formData.set("email", email);
  formData.set("password", "NewPass456!");
  formData.set("confirmPassword", "NewPass456!");
  return formData;
}

/** The keys of every attempt the actions recorded, in order. */
const recordedKeys = (): unknown[][] =>
  mockRecorded.mock.calls.map(([, keys]) => keys);

const ACTIONS: [string, string, (email: string) => Promise<unknown>][] = [
  ["registerUser", "register", (email) => registerUser(registration(email))],
  [
    "sendEmailVerification",
    "email-verify",
    (email) => sendEmailVerification(email, "en"),
  ],
];

beforeEach(() => {
  jest.clearAllMocks();
  __resetRateLimitStore();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest
    .spyOn(commandBus, "execute")
    .mockResolvedValue({ success: true, message: "done" });
  mockHeaders.mockResolvedValue(new Headers({ "x-forwarded-for": CLIENT_IP }));
  mockFindUser.mockResolvedValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("emailRateLimitKey", () => {
  it("is the address in lower case", () => {
    expect(emailRateLimitKey("Alice@Example.COM")).toBe("alice@example.com");
  });

  it("keeps an address of the longest accepted length whole", () => {
    const longest = addressOf(MAX);

    expect(emailSchema.safeParse(longest).success).toBe(true);
    expect(emailRateLimitKey(longest)).toBe(longest);
  });

  it("cuts a longer text to the length the registration refuses beyond", () => {
    const tooLong = addressOf(MAX + 1);

    expect(emailSchema.safeParse(tooLong).success).toBe(false);
    expect(emailRateLimitKey(tooLong)).toBe(tooLong.slice(0, MAX));
    expect(emailRateLimitKey("A".repeat(1_000_000))).toBe("a".repeat(MAX));
  });

  // Lower case can be longer than the text: the cut comes after it.
  it("is no longer than that when lower case lengthens the text", () => {
    const lengthening = "İ".repeat(MAX);
    expect(lengthening.toLowerCase().length).toBeGreaterThan(MAX);

    expect(emailRateLimitKey(lengthening)).toHaveLength(MAX);
  });

  it.each([
    ["a file", new Blob(["alice@example.com"])],
    ["a number", 42],
    ["an array", ["alice@example.com"]],
    ["an object", { toLowerCase: "alice@example.com" }],
    ["null", null],
    ["undefined", undefined],
  ])("has no key for %s", (_case, value) => {
    expect(emailRateLimitKey(value)).toBeUndefined();
  });
});

describe.each(ACTIONS)("%s", (_name, scope, run) => {
  it("counts an ordinary address under itself in lower case, next to the client IP", async () => {
    await run("Alice@Example.COM");

    expect(mockRecorded).toHaveBeenCalledTimes(1);
    expect(mockRecorded.mock.calls[0][0]).toBe(scope);
    expect([...recordedKeys()[0]].sort()).toEqual([
      CLIENT_IP,
      "alice@example.com",
    ]);
  });

  it("builds no key longer than 254 characters from a text of a million", async () => {
    await run("x".repeat(1_000_000));

    expect(mockRecorded).toHaveBeenCalledTimes(1);
    expect(
      recordedKeys()[0].map((key) =>
        typeof key === "string" ? key.length : key,
      ),
    ).toEqual(expect.arrayContaining([MAX]));
    for (const key of recordedKeys()[0]) {
      expect(typeof key === "string" ? key.length : 0).toBeLessThanOrEqual(MAX);
    }
  });

  // Seen through the limiter itself, without a client IP: texts that differ
  // only beyond the cut share one counter, so the attempt after the limit is
  // refused. With whole keys each text had a counter of its own.
  it("counts texts that differ only beyond 254 characters as one address", async () => {
    mockHeaders.mockResolvedValue(new Headers());
    const { limit } =
      scope === "register" ? RATE_LIMITS.register : RATE_LIMITS.emailVerify;
    const sameStart = "b".repeat(MAX);

    const answers = [];
    for (let attempt = 0; attempt <= limit; attempt++) {
      answers.push(await run(`${sameStart}${attempt}@example.com`));
    }

    expect(recordedKeys().map((keys) => keys.filter(Boolean))).toEqual(
      Array.from({ length: limit + 1 }, () => [sameStart]),
    );
    expect(answers.slice(0, limit)).not.toContainEqual(
      expect.objectContaining({ message: expect.stringMatching(/^Too many/) }),
    );
    expect(answers[limit]).toMatchObject({
      success: false,
      message: expect.stringMatching(/^Too many/),
    });
  });
});

describe("a value that is no text", () => {
  // A form field can hold a file.
  it("registerUser counts the attempt against the client IP alone and answers", async () => {
    const result = await registerUser(
      registration(new Blob(["alice@example.com"])),
    );

    expect(result).toEqual({ success: true, message: "done" });
    expect(recordedKeys().map((keys) => keys.filter(Boolean))).toEqual([
      [CLIENT_IP],
    ]);
  });

  // An argument of a server action is whatever the client sends.
  it.each([
    ["a number", 42],
    ["an array", ["alice@example.com"]],
    ["an object", { contains: "" }],
    ["null", null],
  ])(
    "sendEmailVerification counts %s against the client IP alone and looks no user up",
    async (_case, value) => {
      const result = await sendEmailVerification(
        value as unknown as string,
        "en",
      );

      expect(result.success).toBe(false);
      expect(recordedKeys().map((keys) => keys.filter(Boolean))).toEqual([
        [CLIENT_IP],
      ]);
      expect(mockFindUser).not.toHaveBeenCalled();
    },
  );
});
