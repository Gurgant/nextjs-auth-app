/**
 * @jest-environment node
 *
 * What the registration, the password change, the rate limits and the 2FA
 * code check answer is a message of messages/<locale>.json in the language of
 * the page, not an English literal. A browser sends that language in the form
 * field `_locale` (useLocalizedAction); sendEmailVerification takes it as an
 * argument. The last group of tests has the one case in which the answer is
 * not in the language of the form: a field that says `en` and a NEXT_LOCALE
 * cookie of another language.
 * The real command bus, the two real commands, the real resolveFormLocale and
 * the real server-translation helpers are used; getTranslations (mocked in
 * jest.setup.js) is given an implementation that reads messages/<locale>.json.
 * The session, the rate limiter, the repository, Prisma and the TOTP check
 * are mocked.
 */
import { getTranslations } from "next-intl/server";
import enMessages from "../../../../messages/en.json";
import esMessages from "../../../../messages/es.json";
import frMessages from "../../../../messages/fr.json";
import itMessages from "../../../../messages/it.json";
import deMessages from "../../../../messages/de.json";

// The NEXT_LOCALE cookie of the request. There is none, so that the language
// comes from the form alone, except in the last group of tests.
const mockCookieLocale = jest.fn<string | undefined, []>();
jest.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => {
      const value = name === "NEXT_LOCALE" ? mockCookieLocale() : undefined;
      return value === undefined ? undefined : { value };
    },
  }),
}));

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

const mockFindUnique = jest.fn();
jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: () => mockFindUnique() } },
}));

const mockRepo = {
  findByEmail: jest.fn(),
  findById: jest.fn(),
  createWithAccount: jest.fn(),
  updatePassword: jest.fn(),
  update: jest.fn(),
};
jest.mock("@/lib/repositories", () => ({
  repositories: { getUserRepository: () => mockRepo },
}));

// The rate limiter has its own unit test: here a test says what it answers.
const mockRecordAttempt = jest.fn();
jest.mock("@/lib/rate-limit", () => ({
  recordAttempt: () => mockRecordAttempt(),
  RATE_LIMITS: {
    emailVerify: { limit: 5, windowMs: 900000 },
    passwordVerify: { limit: 5, windowMs: 900000 },
    register: { limit: 5, windowMs: 3600000 },
  },
}));

jest.mock("@/lib/security", () => ({
  getClientIP: () => undefined,
  requestMetadata: () => ({}),
  decrypt: () => "JBSWY3DPEHPK3PXP",
}));

jest.mock("@/lib/email", () => ({
  sendVerificationEmail: jest.fn(),
  sendSecurityAlert: jest.fn(),
}));

// The secret is accepted and the code is not.
jest.mock("@/lib/two-factor", () => ({
  isValidSecret: () => true,
  validateTOTPCode: () => false,
}));

jest.mock("@/lib/events", () => ({
  eventBus: { publish: async () => {} },
}));

import bcrypt from "bcryptjs";
import { registerUser, changeUserPassword } from "../auth";
import { sendEmailVerification, enableTwoFactorAuth } from "../advanced-auth";
import { commandBus } from "@/lib/commands";

const MESSAGES = {
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  it: itMessages,
  de: deMessages,
};
type Locale = keyof typeof MESSAGES;
const LOCALES = Object.keys(MESSAGES) as Locale[];

const ALLOWED = { blocked: false, remaining: 99, retryAfterSeconds: 0 };
const BLOCKED = { blocked: true, remaining: 0, retryAfterSeconds: 60 };

const INTERNAL_ERROR = "connect ECONNREFUSED db.internal:5432";
const CURRENT = "OldPass123!";
const NEW = "NewPass456!";

/** A form as a page in `locale` sends it. */
function form(locale: Locale, fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  formData.set("_locale", locale);
  return formData;
}

const registration = (locale: Locale, fields: Record<string, string> = {}) =>
  form(locale, {
    name: "Alice Example",
    email: "alice@example.com",
    password: NEW,
    confirmPassword: NEW,
    ...fields,
  });

const passwordChange = (locale: Locale, fields: Record<string, string> = {}) =>
  form(locale, {
    currentPassword: CURRENT,
    newPassword: NEW,
    confirmPassword: NEW,
    ...fields,
  });

/**
 * Lets getTranslations read messages/<locale>.json. The server translation
 * helpers read the flat "Errors" and "Success" sections only.
 */
function readTheMessageFiles() {
  (getTranslations as unknown as jest.Mock).mockImplementation(
    async ({
      locale: requested,
      namespace,
    }: {
      locale: Locale;
      namespace: "Errors" | "Success";
    }) =>
      (key: string) =>
        (MESSAGES[requested][namespace] as Record<string, string>)[key],
  );
}

describe.each(LOCALES)("%s", (locale) => {
  const previousRounds = process.env.BCRYPT_ROUNDS;
  const { Errors, Success } = MESSAGES[locale];

  beforeEach(async () => {
    // next/jest loads the developer's .env: pin the cost so the test is fast.
    process.env.BCRYPT_ROUNDS = "4";
    jest.resetAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    readTheMessageFiles();
    mockRecordAttempt.mockReturnValue(ALLOWED);
    mockAuth.mockResolvedValue({ user: { id: "user-123" } });
    mockRepo.findByEmail.mockResolvedValue(null);
    mockRepo.createWithAccount.mockResolvedValue({
      id: "u1",
      email: "alice@example.com",
      name: "Alice Example",
    });
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

  describe("registerUser", () => {
    it("a new account", async () => {
      await expect(registerUser(registration(locale))).resolves.toEqual({
        success: true,
        message: Success.accountCreated,
        data: { userId: "u1" },
      });
    });

    it("a form that fails the validation", async () => {
      await expect(
        registerUser(registration(locale, { confirmPassword: "Other789!x" })),
      ).resolves.toEqual({ success: false, message: Errors.validationFailed });
      expect(mockRepo.createWithAccount).not.toHaveBeenCalled();
    });

    it("an address that is already registered", async () => {
      mockRepo.findByEmail.mockResolvedValue({ id: "existing-user" });

      await expect(registerUser(registration(locale))).resolves.toEqual({
        success: false,
        message: Errors.userAlreadyExists,
      });
      expect(mockRepo.createWithAccount).not.toHaveBeenCalled();
    });

    it("a failure the command did not expect", async () => {
      mockRepo.findByEmail.mockRejectedValue(new Error(INTERNAL_ERROR));

      await expect(registerUser(registration(locale))).resolves.toEqual({
        success: false,
        message: Errors.somethingWentWrong,
      });
    });

    it("more attempts than the limit allows", async () => {
      mockRecordAttempt.mockReturnValue(BLOCKED);

      await expect(registerUser(registration(locale))).resolves.toEqual({
        success: false,
        message: Errors.tooManySignUpAttempts,
      });
      expect(mockRepo.findByEmail).not.toHaveBeenCalled();
    });

    // The guard of changeUserPassword, here as well: an unexpected failure
    // of the bus is answered, the action does not reject.
    it("a failure of the command bus is answered, not thrown", async () => {
      const errorSpy = console.error as unknown as jest.SpyInstance;
      jest
        .spyOn(commandBus, "execute")
        .mockRejectedValueOnce(new Error("bus exploded"));

      const result = await registerUser(registration(locale));

      expect(result).toEqual({
        success: false,
        message: Errors.failedToCreateAccount,
      });
      expect(JSON.stringify(result)).not.toContain("bus exploded");
      expect(errorSpy).toHaveBeenCalledWith(
        "[registerUser] Error:",
        expect.objectContaining({ message: "bus exploded" }),
      );
    });
  });

  describe("changeUserPassword", () => {
    it("a changed password", async () => {
      await expect(changeUserPassword(passwordChange(locale))).resolves.toEqual(
        {
          success: true,
          message: Success.passwordChanged,
          data: { userId: "user-123", passwordChanged: true },
        },
      );
    });

    it.each([
      ["a confirmation that does not match", { confirmPassword: "Other789!x" }],
      [
        "a new password that fails the policy",
        { newPassword: "weak", confirmPassword: "weak" },
      ],
      [
        "a new password equal to the current one",
        { newPassword: CURRENT, confirmPassword: CURRENT },
      ],
    ])("%s", async (_case, fields) => {
      await expect(
        changeUserPassword(passwordChange(locale, fields)),
      ).resolves.toEqual({ success: false, message: Errors.validationFailed });
      expect(mockRepo.updatePassword).not.toHaveBeenCalled();
    });

    it("a wrong current password", async () => {
      await expect(
        changeUserPassword(
          passwordChange(locale, { currentPassword: "Wrong123!x" }),
        ),
      ).resolves.toEqual({
        success: false,
        message: Errors.currentPasswordIncorrect,
      });
      expect(mockRepo.updatePassword).not.toHaveBeenCalled();
    });

    it("a signed-in user that no longer exists", async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(changeUserPassword(passwordChange(locale))).resolves.toEqual(
        { success: false, message: Errors.userNotFound },
      );
    });

    it("an account without a password", async () => {
      mockRepo.findById.mockResolvedValue({ id: "user-123", password: null });

      await expect(changeUserPassword(passwordChange(locale))).resolves.toEqual(
        { success: false, message: Errors.noPasswordSet },
      );
    });

    it("a failure the command did not expect", async () => {
      mockRepo.updatePassword.mockRejectedValue(new Error(INTERNAL_ERROR));

      await expect(changeUserPassword(passwordChange(locale))).resolves.toEqual(
        {
          success: false,
          message: Errors.somethingWentWrong,
        },
      );
    });

    it("more attempts than the limit allows", async () => {
      mockRecordAttempt.mockReturnValue(BLOCKED);

      await expect(changeUserPassword(passwordChange(locale))).resolves.toEqual(
        { success: false, message: Errors.tooManyAttempts },
      );
      expect(mockRepo.findById).not.toHaveBeenCalled();
    });
  });

  it("sendEmailVerification: more e-mails than the limit allows", async () => {
    mockRecordAttempt.mockReturnValue(BLOCKED);

    await expect(
      sendEmailVerification("someone@example.com", locale),
    ).resolves.toEqual({
      success: false,
      message: Errors.tooManyVerificationEmails,
    });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("enableTwoFactorAuth: a code that is not the current one", async () => {
    mockFindUnique.mockResolvedValue({
      id: "user-123",
      email: "someone@example.com",
      name: "Someone",
      twoFactorEnabled: false,
    });

    await expect(
      enableTwoFactorAuth(
        form(locale, {
          encryptedSecret: "an-encrypted-secret",
          verificationCode: "123456",
        }),
        "ignored",
      ),
    ).resolves.toEqual({
      success: false,
      message: Errors.invalidVerificationCode,
      errors: { verificationCode: [Errors.invalidVerificationCode] },
    });
  });
});

// The form and the cookie can disagree: the page was opened in one language
// and another tab changed the cookie. resolveFormLocale cannot tell a field
// that says `en` from a field that was not sent, so a page in English is
// answered in the language of the cookie; any other page in its own.
describe("a form field and a NEXT_LOCALE cookie that disagree", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    readTheMessageFiles();
    mockRecordAttempt.mockReturnValue(BLOCKED);
  });

  it.each<[Locale, string | undefined, Locale]>([
    ["en", "fr", "fr"],
    ["en", "de", "de"],
    ["en", undefined, "en"],
    ["en", "xx", "en"],
    ["de", "fr", "de"],
    ["de", "en", "de"],
  ])(
    "registerUser answers the form field %s with the cookie %s in %s",
    async (field, cookie, language) => {
      mockCookieLocale.mockReturnValue(cookie);

      await expect(registerUser(registration(field))).resolves.toEqual({
        success: false,
        message: MESSAGES[language].Errors.tooManySignUpAttempts,
      });
    },
  );
});

// The texts differ between the languages, so an answer in the wrong one does
// not pass above by being the same text.
it("the five languages have five different texts for each of these answers", () => {
  const keys = {
    Errors: [
      "tooManySignUpAttempts",
      "tooManyAttempts",
      "tooManyVerificationEmails",
      "invalidVerificationCode",
      "failedToCreateAccount",
      "validationFailed",
      "userAlreadyExists",
      "currentPasswordIncorrect",
      "noPasswordSet",
      "somethingWentWrong",
      "userNotFound",
    ],
    Success: ["accountCreated", "passwordChanged"],
  } as const;

  for (const key of keys.Errors) {
    expect(
      new Set(LOCALES.map((locale) => MESSAGES[locale].Errors[key])).size,
    ).toBe(LOCALES.length);
  }
  for (const key of keys.Success) {
    expect(
      new Set(LOCALES.map((locale) => MESSAGES[locale].Success[key])).size,
    ).toBe(LOCALES.length);
  }
});
