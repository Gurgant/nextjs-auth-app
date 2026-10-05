/**
 * useAccountData: a failure of /api/account/info is shown on the account page
 * (AccountManagement puts `error` into an alert). The route does not know the
 * language of the page, so it names each failure with a `code` and the hook
 * says it in the language of the page; the English `message` of the route is
 * not shown. The bodies below are the ones the route answers
 * (src/app/api/account/info/__tests__/route.test.ts). fetch is mocked;
 * useTranslations reads messages/<locale>.json.
 */
import { renderHook, waitFor } from "@testing-library/react";
import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
import frMessages from "../../../messages/fr.json";
import itMessages from "../../../messages/it.json";
import deMessages from "../../../messages/de.json";

const MESSAGES = {
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  it: itMessages,
  de: deMessages,
};
type Locale = keyof typeof MESSAGES;
const LOCALES = Object.keys(MESSAGES) as Locale[];

let mockLocale: Locale = "en";
// One translator for each namespace and locale: the hook has it in the
// dependencies of its effect.
const mockTranslators = new Map<string, (key: string) => string>();
jest.mock("next-intl", () => ({
  useTranslations: (namespace: "Errors" | "ComponentErrors") => {
    const id = `${mockLocale}.${namespace}`;
    if (!mockTranslators.has(id)) {
      const messages: Record<string, string> = MESSAGES[mockLocale][namespace];
      mockTranslators.set(id, (key) => messages[key]);
    }
    return mockTranslators.get(id);
  },
}));

import { useAccountData } from "../use-account-data";

const mockFetch = jest.fn();

/** What fetch resolves with for an answer of the route. */
const answer = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const ACCOUNT = {
  hasGoogleAccount: false,
  hasPassword: true,
  hasEmailAccount: true,
  emailVerified: true,
  twoFactorEnabled: true,
  lastLoginMethod: "credentials",
  createdAt: "2025-07-30T00:00:00.000Z",
  backupCodesCount: 8,
};

// The four failures of the route, as it answers them.
const UNAUTHORIZED = answer(401, {
  success: false,
  code: "unauthorized",
  message: "Unauthorized",
});
const USER_NOT_FOUND = answer(404, {
  success: false,
  code: "userNotFound",
  message: "User not found",
});
const UNAVAILABLE = answer(503, {
  success: false,
  code: "accountInfoUnavailable",
  message: "Account information is temporarily unavailable",
});
const FAILED = answer(500, {
  success: false,
  code: "failedToLoadAccountInfo",
  message: "Failed to load account information",
});

/** The state of the hook once the request has been answered. */
async function loaded() {
  const { result } = renderHook(() => useAccountData("user-123"));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  return result.current;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  global.fetch = mockFetch;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe.each(LOCALES)("%s", (locale) => {
  const { Errors, ComponentErrors } = MESSAGES[locale];

  beforeEach(() => {
    mockLocale = locale;
  });

  it("gives the account data of a successful answer, and no error", async () => {
    mockFetch.mockResolvedValue(answer(200, { success: true, data: ACCOUNT }));

    await expect(loaded()).resolves.toMatchObject({
      accountInfo: ACCOUNT,
      error: null,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/account/info",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it.each([
    ["no session", UNAUTHORIZED, Errors.unauthorized],
    ["no user row for the session", USER_NOT_FOUND, Errors.userNotFound],
    ["a database failure", UNAVAILABLE, Errors.accountInfoUnavailable],
    ["any other failure", FAILED, ComponentErrors.failedToLoadAccountInfo],
  ])("%s: the text of this language", async (_case, response, text) => {
    mockFetch.mockResolvedValue(response);

    await expect(loaded()).resolves.toMatchObject({
      accountInfo: null,
      error: text,
    });
  });

  // An answer the hook does not know is not shown as it is.
  it.each([
    [
      "a failure with a code the hook does not know",
      answer(418, { success: false, code: "teapot", message: "I'm a teapot" }),
    ],
    [
      "a failure without a code",
      answer(500, { success: false, message: "Internal Server Error" }),
    ],
    ["a body that is no object", answer(502, "Bad Gateway")],
    ["a success without data", answer(200, { success: true })],
  ])("%s: the general text of this language", async (_case, response) => {
    mockFetch.mockResolvedValue(response);

    await expect(loaded()).resolves.toMatchObject({
      accountInfo: null,
      error: ComponentErrors.failedToLoadAccountInfo,
    });
  });

  it("a request that fails: the general text of this language", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(loaded()).resolves.toMatchObject({
      accountInfo: null,
      error: ComponentErrors.failedToLoadAccountInfo,
    });
  });
});

it("without a user id nothing is requested", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  const { result } = renderHook(() => useAccountData(undefined));

  await waitFor(() => expect(result.current.isLoading).toBe(false));

  expect(mockFetch).not.toHaveBeenCalled();
  expect(result.current).toMatchObject({ accountInfo: null, error: null });
});

// The texts differ between the languages, so a text in the wrong one does not
// pass above by being the same.
it("the five languages have five different texts for each failure", () => {
  for (const text of [
    (m: (typeof MESSAGES)[Locale]) => m.Errors.unauthorized,
    (m: (typeof MESSAGES)[Locale]) => m.Errors.userNotFound,
    (m: (typeof MESSAGES)[Locale]) => m.Errors.accountInfoUnavailable,
    (m: (typeof MESSAGES)[Locale]) => m.ComponentErrors.failedToLoadAccountInfo,
  ]) {
    expect(new Set(LOCALES.map((locale) => text(MESSAGES[locale]))).size).toBe(
      LOCALES.length,
    );
  }
});
