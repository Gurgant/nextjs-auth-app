/**
 * @jest-environment node
 *
 * registerUser: the locale it answers in, and hands to the command, is the
 * one resolveFormLocale gives: one of the five supported locales, whatever a
 * client sends. It is the form field `_locale`, which useLocalizedAction
 * appends, unless that field is missing, unsupported or the default `en`:
 * then it is the NEXT_LOCALE cookie. The real resolveFormLocale is used; the
 * command bus is spied and answers at once, except in the last group of
 * tests, which runs the real bus and the real command.
 */
const mockCookie = jest.fn<string | undefined, []>();
jest.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) =>
      name === "NEXT_LOCALE" && mockCookie() !== undefined
        ? { value: mockCookie() }
        : undefined,
  }),
}));

jest.mock("@/lib/auth", () => ({
  auth: async () => null,
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
  getClientIP: () => "203.0.113.7",
  requestMetadata: () => ({ ipAddress: "203.0.113.7" }),
}));

jest.mock("@/lib/repositories", () => ({
  repositories: { getUserRepository: () => ({}) },
}));

jest.mock("@/lib/events", () => ({
  eventBus: { publish: async () => {} },
}));

import { registerUser } from "../auth";
import { commandBus, RegisterUserCommand } from "@/lib/commands";

const SUPPORTED = ["en", "es", "fr", "it", "de"];
// Values a client can put into a form field or a cookie.
const UNSUPPORTED = ["xx", "en-US", '"><script>alert(1)</script>', "DE"];

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries({
    name: "New User",
    email: "new.user@example.com",
    password: "NewPass456!",
    confirmPassword: "NewPass456!",
    ...fields,
  })) {
    formData.set(key, value);
  }
  return formData;
}

describe("registerUser: the locale", () => {
  let executeSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCookie.mockReturnValue(undefined);
    executeSpy = jest
      .spyOn(commandBus, "execute")
      .mockResolvedValue({ success: true, message: "done" });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** The locale of the one call of the bus: in the input and in the metadata. */
  async function localesHandedOn(formData: FormData) {
    await registerUser(formData);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    const [Command, input, metadata] = executeSpy.mock.calls[0];
    expect(Command).toBe(RegisterUserCommand);
    return { input: input.locale, metadata: metadata.locale };
  }

  it.each(SUPPORTED)(
    "hands on the supported locale %s of the form field _locale",
    async (locale) => {
      expect(await localesHandedOn(form({ _locale: locale }))).toEqual({
        input: locale,
        metadata: locale,
      });
    },
  );

  it.each(UNSUPPORTED)(
    "hands on the default locale instead of the form value %p",
    async (locale) => {
      expect(await localesHandedOn(form({ _locale: locale }))).toEqual({
        input: "en",
        metadata: "en",
      });
    },
  );

  // The action used to read a field named `locale`, which no form of the app
  // sends, and to hand its text on unchecked.
  it.each([...SUPPORTED.filter((locale) => locale !== "en"), ...UNSUPPORTED])(
    "does not read a form field named locale (%p)",
    async (locale) => {
      expect(await localesHandedOn(form({ locale }))).toEqual({
        input: "en",
        metadata: "en",
      });
    },
  );

  // A form field can hold a file.
  it("hands on the default locale when the field _locale holds a file", async () => {
    const formData = form({});
    formData.set("_locale", new Blob(["de"]), "locale.txt");

    expect(await localesHandedOn(formData)).toEqual({
      input: "en",
      metadata: "en",
    });
  });

  it("falls back to a supported locale of the cookie when the form has none", async () => {
    mockCookie.mockReturnValue("fr");

    expect(await localesHandedOn(form({}))).toEqual({
      input: "fr",
      metadata: "fr",
    });
  });

  it.each(UNSUPPORTED)(
    "hands on the default locale instead of the cookie value %p",
    async (locale) => {
      mockCookie.mockReturnValue(locale);

      expect(await localesHandedOn(form({}))).toEqual({
        input: "en",
        metadata: "en",
      });
    },
  );

  // The form and the cookie can disagree: the page was opened in one
  // language and another tab changed the cookie. resolveFormLocale cannot
  // tell a field that says `en` from a field that was not sent, so the
  // cookie decides for a page in English, and the field for any other page.
  it.each([
    ["en", "fr", "fr"],
    ["en", "de", "de"],
    ["en", "en", "en"],
    ["de", "fr", "de"],
    ["de", "en", "de"],
    ["es", "it", "es"],
  ])(
    "with the form field %s and the cookie %s it hands on %s",
    async (field, cookie, expected) => {
      mockCookie.mockReturnValue(cookie);

      expect(await localesHandedOn(form({ _locale: field }))).toEqual({
        input: expected,
        metadata: expected,
      });
    },
  );
});

// A form field can hold a file. Through the real bus and the real command:
// the action answers the form as invalid and does not reject.
describe("registerUser: a file where the form has a text", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCookie.mockReturnValue(undefined);
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(["name", "email", "password", "confirmPassword"])(
    "answers a file in the field %s as an invalid form",
    async (field) => {
      const formData = form({});
      formData.set(field, new Blob(["text"]), "field.txt");
      const executeSpy = jest.spyOn(commandBus, "execute");

      // The message is its key: jest.setup.js translates every key to itself.
      await expect(registerUser(formData)).resolves.toEqual({
        success: false,
        message: "validationFailed",
      });
      expect(executeSpy).toHaveBeenCalledTimes(1);
    },
  );
});
