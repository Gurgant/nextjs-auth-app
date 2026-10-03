/**
 * @jest-environment node
 *
 * The "not signed in" and "user not found" answers of the account actions
 * are the Errors messages of the requested locale (messages/<locale>.json),
 * not an English literal. The real server-translation helpers are used;
 * getTranslations (mocked in jest.setup.js) is given an implementation that
 * reads messages/<locale>.json. The two keys expected here are in all five
 * files; for a missing key that implementation returns undefined, where
 * next-intl returns "Errors.<key>".
 */
import { getTranslations } from "next-intl/server";
import enMessages from "../../../../messages/en.json";
import esMessages from "../../../../messages/es.json";
import frMessages from "../../../../messages/fr.json";
import itMessages from "../../../../messages/it.json";
import deMessages from "../../../../messages/de.json";

jest.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

const mockFindUnique = jest.fn();
jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: () => mockFindUnique() } },
}));

const mockFindById = jest.fn();
jest.mock("@/lib/repositories", () => ({
  repositories: { getUserRepository: () => ({ findById: mockFindById }) },
}));

// The rate limiter has its own unit test: here it always allows.
jest.mock("@/lib/rate-limit", () => ({
  recordAttempt: () => ({
    blocked: false,
    remaining: 99,
    retryAfterSeconds: 0,
  }),
  RATE_LIMITS: {
    emailVerify: { limit: 5, windowMs: 900000 },
    passwordVerify: { limit: 5, windowMs: 900000 },
    register: { limit: 5, windowMs: 3600000 },
  },
}));

jest.mock("@/lib/security", () => ({
  getClientIP: () => undefined,
}));

jest.mock("@/lib/email", () => ({
  sendVerificationEmail: jest.fn(),
  sendSecurityAlert: jest.fn(),
}));

jest.mock("@/lib/two-factor", () => ({}));

let mockFormLocale = "en";
jest.mock("@/lib/utils/form-locale-server", () => ({
  resolveFormLocale: async () => mockFormLocale,
}));

jest.mock("@/lib/events", () => ({
  eventBus: { publish: async () => {} },
}));

import {
  sendEmailVerification,
  setupTwoFactorAuth,
  enableTwoFactorAuth,
  disableTwoFactorAuth,
} from "../advanced-auth";
import { addPasswordToGoogleUser } from "../auth";

const MESSAGES = {
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  it: itMessages,
  de: deMessages,
};
type Locale = keyof typeof MESSAGES;
const LOCALES = Object.keys(MESSAGES) as Locale[];

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

const enableForm = () =>
  form({ encryptedSecret: "encrypted-secret", verificationCode: "123456" });
const passwordForm = () =>
  form({ password: "NewPass456!", confirmPassword: "NewPass456!" });

type Answer = Promise<{ success: boolean; message: string }>;

// The actions that need a session. The locale is a parameter, or it comes
// from resolveFormLocale (mocked above) for an action that takes a form.
const SESSION_ACTIONS: Record<string, (locale: Locale) => Answer> = {
  setupTwoFactorAuth: (locale) => setupTwoFactorAuth("ignored", locale),
  enableTwoFactorAuth: () => enableTwoFactorAuth(enableForm(), "ignored"),
  disableTwoFactorAuth: (locale) => disableTwoFactorAuth("ignored", locale),
  addPasswordToGoogleUser: () => addPasswordToGoogleUser(passwordForm()),
};

// The actions that look the user up; sendEmailVerification needs no session.
const LOOKUP_ACTIONS: Record<string, (locale: Locale) => Answer> = {
  ...SESSION_ACTIONS,
  sendEmailVerification: (locale) =>
    sendEmailVerification("nobody@example.com", locale),
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  // The server translation helpers read the flat "Errors" and "Success"
  // sections only.
  (getTranslations as unknown as jest.Mock).mockImplementation(
    async ({
      locale,
      namespace,
    }: {
      locale: Locale;
      namespace: "Errors" | "Success";
    }) =>
      (key: string) =>
        (MESSAGES[locale][namespace] as Record<string, string>)[key],
  );
  mockFindUnique.mockResolvedValue(null);
  mockFindById.mockResolvedValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe.each(LOCALES)("%s", (locale) => {
  beforeEach(() => {
    mockFormLocale = locale;
  });

  it.each(Object.keys(SESSION_ACTIONS))(
    "%s answers a request without a session in this locale",
    async (action) => {
      mockAuth.mockResolvedValue(null);

      await expect(SESSION_ACTIONS[action](locale)).resolves.toEqual({
        success: false,
        message: MESSAGES[locale].Errors.unauthorized,
      });
    },
  );

  it.each(Object.keys(LOOKUP_ACTIONS))(
    "%s answers a user that no longer exists in this locale",
    async (action) => {
      mockAuth.mockResolvedValue({ user: { id: "user-123" } });

      await expect(LOOKUP_ACTIONS[action](locale)).resolves.toEqual({
        success: false,
        message: MESSAGES[locale].Errors.userNotFound,
      });
    },
  );
});
