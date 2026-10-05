/**
 * The e-mail verification page has three screens, each in the language of the
 * page: the address was verified by this request, the address was already
 * verified (the link was followed before: a reload, a change of language, a
 * mail scanner), and the failure. The page is a server component: it is
 * awaited and its result rendered. verifyEmailToken is mocked;
 * getTranslations (mocked in jest.setup.js) reads messages/<locale>.json.
 */
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { getTranslations } from "next-intl/server";
import enMessages from "../../../../../../messages/en.json";
import esMessages from "../../../../../../messages/es.json";
import frMessages from "../../../../../../messages/fr.json";
import itMessages from "../../../../../../messages/it.json";
import deMessages from "../../../../../../messages/de.json";

const mockVerifyEmailToken = jest.fn();
jest.mock("@/lib/actions/advanced-auth", () => ({
  verifyEmailToken: (token: string, locale: string) =>
    mockVerifyEmailToken(token, locale),
}));

jest.mock("@/components/layouts", () => ({
  FormPageLayout: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}));

import VerifyEmailPage from "../page";

const MESSAGES = {
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  it: itMessages,
  de: deMessages,
};
type Locale = keyof typeof MESSAGES;
const LOCALES = Object.keys(MESSAGES) as Locale[];

const TOKEN = "a1B2".repeat(8);

async function renderPage(locale: Locale) {
  // The page asks for the translator of the request, without a locale.
  (getTranslations as unknown as jest.Mock).mockImplementation(
    async (namespace: "EmailVerification") => (key: string) =>
      (MESSAGES[locale][namespace] as Record<string, string>)[key],
  );
  render(
    await VerifyEmailPage({
      params: Promise.resolve({ locale, token: TOKEN }),
    }),
  );
}

const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
const links = () =>
  screen.getAllByRole("link").map((link) => link.getAttribute("href"));

beforeEach(() => {
  jest.clearAllMocks();
});

describe.each(LOCALES)("%s", (locale) => {
  const t = MESSAGES[locale].EmailVerification;

  it("hands the action the token and the locale of the address", async () => {
    mockVerifyEmailToken.mockResolvedValue({ success: false, message: "x" });

    await renderPage(locale);

    expect(mockVerifyEmailToken.mock.calls).toEqual([[TOKEN, locale]]);
  });

  it("an address verified by this request: the success screen", async () => {
    mockVerifyEmailToken.mockResolvedValue({
      success: true,
      message: "verified now",
      data: { alreadyVerified: false },
    });

    await renderPage(locale);

    expect(heading()).toBe(t.successTitle);
    expect(screen.getByText(t.successMessage)).toBeInTheDocument();
    expect(screen.queryByText(t.alreadyVerifiedMessage)).toBeNull();
    expect(screen.queryByText(t.requestNewVerification)).toBeNull();
    expect(links()).toEqual([`/${locale}/account`, `/${locale}/account`]);
  });

  it("an address that was already verified: its own screen, not the failure and not the success text", async () => {
    mockVerifyEmailToken.mockResolvedValue({
      success: true,
      message: "already verified",
      data: { alreadyVerified: true },
    });

    await renderPage(locale);

    expect(heading()).toBe(t.alreadyVerifiedTitle);
    expect(screen.getByText(t.alreadyVerifiedMessage)).toBeInTheDocument();
    expect(screen.queryByText(t.successTitle)).toBeNull();
    expect(screen.queryByText(t.successMessage)).toBeNull();
    expect(screen.queryByText(t.failureTitle)).toBeNull();
    expect(screen.queryByText(t.requestNewVerification)).toBeNull();
    expect(links()).toEqual([`/${locale}/account`, `/${locale}/account`]);
  });

  it("a failure: the failure screen with the message of the action", async () => {
    const message = MESSAGES[locale].Errors.verificationTokenUsed;
    mockVerifyEmailToken.mockResolvedValue({ success: false, message });

    await renderPage(locale);

    expect(heading()).toBe(t.failureTitle);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByText(t.requestNewVerification)).toBeInTheDocument();
    expect(screen.queryByText(t.alreadyVerifiedMessage)).toBeNull();
    expect(screen.queryByText(t.successMessage)).toBeNull();
    expect(links()).toEqual([`/${locale}/account`, `/${locale}`]);
  });
});

// The three headings differ within a language and between the languages, so
// one screen does not pass for another.
it("the screens have fifteen different headings", () => {
  const headings = LOCALES.flatMap((locale) => {
    const t = MESSAGES[locale].EmailVerification;
    return [t.successTitle, t.alreadyVerifiedTitle, t.failureTitle];
  });

  expect(new Set(headings).size).toBe(15);
});
