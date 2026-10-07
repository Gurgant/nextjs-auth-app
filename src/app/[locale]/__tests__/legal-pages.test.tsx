/**
 * /{locale}/terms and /{locale}/privacy are the two pages that the terms
 * sentence of the registration form links to. Both hold placeholder text of
 * the starter kit and say so; neither asks for a session. The pages are
 * server components: each is awaited and its result rendered. The stand-in
 * for getTranslations of jest.setup.js answers with the key; useMessagesOf()
 * below replaces it with one that reads messages/<locale>.json.
 */
import { render, screen, within } from "@testing-library/react";
import { getTranslations } from "next-intl/server";
import enMessages from "../../../../messages/en.json";
import esMessages from "../../../../messages/es.json";
import frMessages from "../../../../messages/fr.json";
import itMessages from "../../../../messages/it.json";
import deMessages from "../../../../messages/de.json";

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

import TermsPage, { generateMetadata as termsMetadata } from "../terms/page";
import PrivacyPage, {
  generateMetadata as privacyMetadata,
} from "../privacy/page";
import { AuthGuard } from "@/components/layouts/auth-guard";

const MESSAGES = {
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  it: itMessages,
  de: deMessages,
};
type Locale = keyof typeof MESSAGES;
const LOCALES = Object.keys(MESSAGES) as Locale[];

const PAGES = [
  { name: "terms", Page: TermsPage, metadata: termsMetadata },
  { name: "privacy", Page: PrivacyPage, metadata: privacyMetadata },
] as const;

interface Texts {
  [key: string]: string | Texts;
}

/** The translator of a locale, asked by namespace or by { namespace }. */
function useMessagesOf(locale: Locale) {
  (getTranslations as unknown as jest.Mock).mockImplementation(
    async (asked: string | { namespace: string }) => (key: string) => {
      const namespace = typeof asked === "string" ? asked : asked.namespace;
      return key
        .split(".")
        .reduce<
          string | Texts
        >((node, part) => (node as Texts)[part], (MESSAGES[locale] as Texts)[namespace]);
    },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe.each(LOCALES)("%s", (locale) => {
  const legal = MESSAGES[locale].Legal;

  describe.each(PAGES)("/$name", ({ name, Page, metadata }) => {
    const texts = legal[name];

    async function open() {
      useMessagesOf(locale);
      render(await Page({ params: Promise.resolve({ locale }) }));
    }

    it("is headed by the name of the document", async () => {
      await open();

      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
        texts.title,
      );
    });

    it("says that it is placeholder text of the starter kit that has to be replaced", async () => {
      await open();

      const notice = screen.getByRole("note");
      expect(
        within(notice).getByText(legal.placeholderTitle),
      ).toBeInTheDocument();
      expect(
        within(notice).getByText(legal.placeholderNotice),
      ).toBeInTheDocument();
    });

    it("lists what such a document covers, every point of the message file, in its order", async () => {
      await open();

      expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
        legal.outlineHeading,
      );
      const points = screen
        .getAllByRole("listitem")
        .map((item) => item.textContent);
      expect(points).toEqual(Object.values(texts.outline));
      expect(points.length).toBeGreaterThan(2);
    });

    it("has one link, to the registration page of its locale, and does not call it the way back", async () => {
      await open();

      const links = screen.getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual([
        legal.goToRegistration,
      ]);
      expect(links[0]).toHaveAttribute("href", `/${locale}/register`);
    });

    it("says above that link where the form is that the visitor came from: still open in the other tab", async () => {
      await open();

      const sentence = screen.getByText(legal.stillOpenInOtherTab);
      const [link] = screen.getAllByRole("link");
      expect(
        sentence.compareDocumentPosition(link) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("asks for no session", async () => {
      await open();

      expect(mockAuth).not.toHaveBeenCalled();
    });

    it("is titled with the name of the document and of the application, and described as a placeholder", async () => {
      useMessagesOf(locale);

      await expect(
        metadata({ params: Promise.resolve({ locale }) }),
      ).resolves.toEqual({
        // The pattern of the verification page: "… - Auth App".
        title: `${texts.title} - ${MESSAGES[locale].Layout.appTitle}`,
        description: legal.placeholderNotice,
      });
    });
  });
});

it("the session check would be seen: a guarded page asks for the session", async () => {
  mockAuth.mockResolvedValue(null);

  await AuthGuard({ children: null, locale: "en", requireAuth: false });

  expect(mockAuth).toHaveBeenCalledTimes(1);
});

it("no text of the two pages is left in English in another locale", () => {
  const leaves = (node: Texts, prefix = ""): [string, string][] =>
    Object.entries(node).flatMap(([key, value]) =>
      typeof value === "string"
        ? [[`${prefix}${key}`, value] as [string, string]]
        : leaves(value, `${prefix}${key}.`),
    );
  const english = new Map(leaves(enMessages.Legal));
  expect(english.size).toBeGreaterThan(10);

  for (const locale of LOCALES.filter((other) => other !== "en")) {
    const untranslated = leaves(MESSAGES[locale].Legal)
      .filter(([key, text]) => english.get(key) === text)
      .map(([key]) => key);

    expect([locale, untranslated]).toEqual([locale, []]);
  }
});
