/**
 * The title of the account page in the browser tab: the heading of the page
 * and the name of the application, both in the language of the address, as
 * the terms, privacy and verification pages are titled. It used to be
 * "Account Management" in every language, above a page headed "Account
 * Settings". The description is the line under that heading.
 *
 * Only generateMetadata is called: the page itself is not rendered here.
 * getTranslations (mocked in jest.setup.js) reads messages/<locale>.json.
 */
import { getTranslations } from "next-intl/server";
import enMessages from "../../../../../messages/en.json";
import esMessages from "../../../../../messages/es.json";
import frMessages from "../../../../../messages/fr.json";
import itMessages from "../../../../../messages/it.json";
import deMessages from "../../../../../messages/de.json";

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/components/account/account-page-wrapper", () => ({
  AccountPageWrapper: () => null,
}));

import { generateMetadata } from "../page";

const MESSAGES = {
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  it: itMessages,
  de: deMessages,
};
type Locale = keyof typeof MESSAGES;
const LOCALES = Object.keys(MESSAGES) as Locale[];

beforeEach(() => {
  // The metadata asks for the translator of a locale and a namespace.
  (getTranslations as unknown as jest.Mock).mockImplementation(
    async ({ locale, namespace }: { locale: Locale; namespace: string }) =>
      (key: string) =>
        (MESSAGES[locale] as Record<string, Record<string, unknown>>)[
          namespace
        ][key],
  );
});

const metadataOf = (locale: Locale) =>
  generateMetadata({ params: Promise.resolve({ locale }) });

it("in English the title is the heading of the page and the name of the application", async () => {
  await expect(metadataOf("en")).resolves.toEqual({
    title: "Account Settings - Auth App",
    description: "Manage your account and preferences",
    robots: "noindex",
  });
});

it.each(LOCALES)(
  "%s: the title and the description are the texts of that language",
  async (locale) => {
    const { Account, Layout } = MESSAGES[locale];

    await expect(metadataOf(locale)).resolves.toEqual({
      title: `${Account.title} - ${Layout.appTitle}`,
      description: Account.subtitle,
      // A private page.
      robots: "noindex",
    });
  },
);

it("no other language has the English title", async () => {
  const titles = await Promise.all(
    LOCALES.map(async (locale) => (await metadataOf(locale)).title),
  );

  expect(new Set(titles).size).toBe(LOCALES.length);
});
