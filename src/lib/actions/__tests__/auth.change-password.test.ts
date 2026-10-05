/**
 * @jest-environment node
 *
 * changeUserPassword: an invalid form is ANSWERED with an error response, and
 * an exception from the command bus is turned into one instead of rejecting
 * the server action. Only the bus call is guarded: the steps before it (locale,
 * session, rate limit) are not. The real command bus and ChangePasswordCommand
 * are used; the session, the rate limiter and the repository are mocked.
 * The translation helpers are mocked as well, and hold no text of any
 * language: an answer of this file shows the locale and the message key the
 * action or the command asked for. The English text handed over with a key is
 * the answer only without a translation; what a user reads in each of the
 * five languages is in translated-answers.test.ts.
 */
const mockTranslate = jest.fn();
jest.mock("@/lib/utils/server-translations", () => ({
  translateError: (locale: string, key: string, fallback?: string) =>
    mockTranslate(locale, key, fallback),
  translateSuccess: (locale: string, key: string, fallback?: string) =>
    mockTranslate(locale, key, fallback),
}));

jest.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

// The rate limiter has its own unit test: here it always allows.
jest.mock("@/lib/rate-limit", () => ({
  recordAttempt: () => ({
    blocked: false,
    remaining: 99,
    retryAfterSeconds: 0,
  }),
  RATE_LIMITS: {
    passwordVerify: { limit: 5, windowMs: 900000 },
    register: { limit: 5, windowMs: 3600000 },
  },
}));

jest.mock("@/lib/security", () => ({
  getClientIP: () => "127.0.0.1",
  requestMetadata: () => ({ ipAddress: "127.0.0.1" }),
}));

jest.mock("@/lib/utils/form-locale-server", () => ({
  resolveFormLocale: async () => "en",
}));

const mockRepo = {
  findById: jest.fn(),
  updatePassword: jest.fn(),
  update: jest.fn(),
};
jest.mock("@/lib/repositories", () => ({
  repositories: { getUserRepository: () => mockRepo },
}));

jest.mock("@/lib/events", () => ({
  eventBus: { publish: async () => {} },
}));

import bcrypt from "bcryptjs";
import { changeUserPassword } from "../auth";
import { commandBus } from "@/lib/commands";

const CURRENT = "OldPass123!";
const NEW = "NewPass456!";

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

/** What the mocked helpers answer for a key: the form's locale is "en". */
const translated = (key: string) => `[en] ${key}`;

/** The English texts that were handed over with the keys, in their order. */
const fallbacks = () =>
  mockTranslate.mock.calls.map(([, key, fallback]) => [key, fallback]);

describe("changeUserPassword", () => {
  const previousRounds = process.env.BCRYPT_ROUNDS;
  let errorSpy: jest.SpyInstance;
  let executeSpy: jest.SpyInstance;

  beforeEach(async () => {
    // next/jest loads the developer's .env: pin the cost so the test is fast.
    process.env.BCRYPT_ROUNDS = "4";
    jest.clearAllMocks();
    mockTranslate.mockImplementation(
      async (locale: string, key: string) => `[${locale}] ${key}`,
    );
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
    executeSpy = jest.spyOn(commandBus, "execute");

    mockAuth.mockResolvedValue({ user: { id: "user-123" } });
    mockRepo.findById.mockResolvedValue({
      id: "user-123",
      password: await bcrypt.hash(CURRENT, 4),
    });
    mockRepo.updatePassword.mockResolvedValue(undefined);
    mockRepo.update.mockResolvedValue({ id: "user-123" });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (previousRounds === undefined) {
      delete process.env.BCRYPT_ROUNDS;
    } else {
      process.env.BCRYPT_ROUNDS = previousRounds;
    }
  });

  describe("an invalid form is answered, not thrown (CB-5)", () => {
    it.each([
      [
        "a confirmation that does not match",
        {
          currentPassword: CURRENT,
          newPassword: NEW,
          confirmPassword: "Other789!x",
        },
      ],
      [
        "a new password that fails the policy",
        {
          currentPassword: CURRENT,
          newPassword: "weak",
          confirmPassword: "weak",
        },
      ],
      [
        "a new password equal to the current one",
        {
          currentPassword: CURRENT,
          newPassword: CURRENT,
          confirmPassword: CURRENT,
        },
      ],
      ["an empty form", {}],
    ])("%s", async (_label, fields) => {
      await expect(changeUserPassword(form(fields))).resolves.toEqual({
        success: false,
        message: translated("errors.validationFailed"),
      });
      expect(fallbacks()).toEqual([
        ["errors.validationFailed", "Validation failed"],
      ]);
      expect(mockRepo.updatePassword).not.toHaveBeenCalled();
    });

    it("answers when the signed-in user no longer exists", async () => {
      mockRepo.findById.mockResolvedValue(null);

      const result = await changeUserPassword(
        form({
          currentPassword: CURRENT,
          newPassword: NEW,
          confirmPassword: NEW,
        }),
      );

      // The command's own answer, not the generic one of the action's guard.
      expect(result).toEqual({
        success: false,
        message: translated("errors.userNotFound"),
      });
      expect(fallbacks()).toEqual([
        ["errors.userNotFound", "User with ID 'user-123' not found"],
      ]);
      expect(mockRepo.updatePassword).not.toHaveBeenCalled();
    });

    it("answers when the account has no password", async () => {
      mockRepo.findById.mockResolvedValue({ id: "user-123", password: null });

      const result = await changeUserPassword(
        form({
          currentPassword: CURRENT,
          newPassword: NEW,
          confirmPassword: NEW,
        }),
      );

      expect(result).toEqual({
        success: false,
        message: translated("errors.noPasswordSet"),
      });
      expect(fallbacks()).toEqual([
        [
          "errors.noPasswordSet",
          "Operation 'change password' is not allowed: No password set for this account",
        ],
      ]);
      expect(mockRepo.updatePassword).not.toHaveBeenCalled();
    });

    it("turns an exception from the bus into a generic error response", async () => {
      executeSpy.mockRejectedValueOnce(new Error("bus exploded"));

      const result = await changeUserPassword(
        form({
          currentPassword: CURRENT,
          newPassword: NEW,
          confirmPassword: NEW,
        }),
      );

      expect(result).toEqual({
        success: false,
        message: translated("errors.failedToChangePassword"),
      });
      expect(fallbacks()).toEqual([
        [
          "errors.failedToChangePassword",
          "Failed to change password. Please try again.",
        ],
      ]);
      expect(JSON.stringify(mockTranslate.mock.calls)).not.toContain(
        "bus exploded",
      );
      expect(errorSpy).toHaveBeenCalledWith(
        "[changeUserPassword] Error:",
        expect.objectContaining({ message: "bus exploded" }),
      );
    });
  });

  describe("unchanged behaviour", () => {
    it("changes the password when the form is valid", async () => {
      const result = await changeUserPassword(
        form({
          currentPassword: CURRENT,
          newPassword: NEW,
          confirmPassword: NEW,
        }),
      );

      expect(result).toMatchObject({
        success: true,
        message: translated("success.passwordChanged"),
      });
      expect(fallbacks()).toEqual([
        [
          "success.passwordChanged",
          "Password changed successfully! Please sign in again.",
        ],
      ]);
      expect(mockRepo.updatePassword).toHaveBeenCalledTimes(1);
      const [userId, hash] = mockRepo.updatePassword.mock.calls[0];
      expect(userId).toBe("user-123");
      expect(await bcrypt.compare(NEW, hash)).toBe(true);
    });

    it("refuses a wrong current password with the message for it", async () => {
      const result = await changeUserPassword(
        form({
          currentPassword: "Wrong123!x",
          newPassword: NEW,
          confirmPassword: NEW,
        }),
      );

      expect(result).toEqual({
        success: false,
        message: translated("errors.currentPasswordIncorrect"),
      });
      expect(fallbacks()).toEqual([
        [
          "errors.currentPasswordIncorrect",
          "Invalid input for field: currentPassword",
        ],
      ]);
      expect(mockRepo.updatePassword).not.toHaveBeenCalled();
    });

    it("refuses a request without a session before reaching the bus", async () => {
      mockAuth.mockResolvedValue(null);

      const result = await changeUserPassword(
        form({
          currentPassword: CURRENT,
          newPassword: NEW,
          confirmPassword: NEW,
        }),
      );

      expect(result).toEqual({
        success: false,
        message: translated("errors.unauthorized"),
      });
      expect(fallbacks()).toEqual([
        ["errors.unauthorized", "You must be signed in."],
      ]);
      expect(executeSpy).not.toHaveBeenCalled();
    });
  });
});
