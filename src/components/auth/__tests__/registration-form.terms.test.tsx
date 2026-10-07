/**
 * The terms sentence of the registration form names two documents, and each
 * name is a link to the page of that document under the locale of the form.
 * A link asks for a new tab and says so in its description, and a click on
 * it leaves the checkbox as it was. The accessible name of the checkbox is
 * still the plain sentence.
 *
 * The translator stand-in reads messages/<locale>.json and hands what each
 * <tag>…</tag> of a rich text wraps to the function of that name. It is not
 * next-intl: it knows nothing of the quoting of ICU messages, where an ASCII
 * apostrophe before a tag swallows the tag. The real formatter is asked in
 * src/test/unit/__tests__/rich-messages.real-formatter.test.ts, and the real
 * next-intl renders the label in a browser in e2e/tests/legal-pages.e2e.ts
 * and translation-aware.e2e.ts.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import enMessages from "../../../../messages/en.json";
import esMessages from "../../../../messages/es.json";
import frMessages from "../../../../messages/fr.json";
import itMessages from "../../../../messages/it.json";
import deMessages from "../../../../messages/de.json";
import type { Locale } from "@/config/i18n";

let mockLocale = "en";
jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    const texts: Record<string, string> = jest.requireActual(
      `../../../../messages/${mockLocale}.json`,
    )[namespace];
    const translate = (key: string) => texts[key];
    translate.rich = (
      key: string,
      tags: Record<string, (chunks: string) => unknown>,
    ) => {
      const { Fragment, createElement } = jest.requireActual("react");
      const parts: unknown[] = [];
      const tagged = /<(\w+)>(.*?)<\/\1>/g;
      let end = 0;
      for (const match of texts[key].matchAll(tagged)) {
        parts.push(texts[key].slice(end, match.index));
        parts.push(tags[match[1]](match[2]));
        end = match.index + match[0].length;
      }
      parts.push(texts[key].slice(end));
      // next-intl gives each part a key as well.
      return parts.map((part, index) =>
        createElement(Fragment, { key: index }, part),
      );
    };
    return translate;
  },
}));

jest.mock("@/lib/actions/auth", () => ({ registerUser: jest.fn() }));

import { RegistrationForm } from "../registration-form";

const MESSAGES = {
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  it: itMessages,
  de: deMessages,
};
const LOCALES = Object.keys(MESSAGES) as Locale[];

/** The sentence as a reader sees it: the message without its tags. */
const plain = (message: string) => message.replace(/<\/?\w+>/g, "");

/** What the tag `name` of a message wraps. */
function wrappedBy(message: string, name: string): string {
  const match = new RegExp(`<${name}>(.*?)</${name}>`).exec(message);
  if (!match) throw new Error(`no <${name}> in "${message}"`);
  return match[1];
}

/**
 * Whether two names are the same words. jsdom lays nothing out, and the
 * library that computes an accessible name here takes every element for a
 * block: it puts a space around the text of a link, which shows where a link
 * follows an apostrophe (Italian: "l’ Informativa"). A browser puts none;
 * e2e/tests/translation-aware.e2e.ts compares the exact name of the checkbox
 * in the five locales.
 */
const sameWords = (one: string, other: string) =>
  one.replace(/\s/g, "") === other.replace(/\s/g, "");

function renderForm(locale: Locale) {
  mockLocale = locale;
  const sentence = MESSAGES[locale].Registration.agreeToTerms;
  render(<RegistrationForm locale={locale} />);
  // The name of the checkbox is the sentence, and nothing more.
  const checkbox = screen.getByRole("checkbox", {
    name: (name) => sameWords(name, plain(sentence)),
  });
  const label = screen.getByText(
    (_text, element) =>
      element?.tagName === "LABEL" && element.textContent === plain(sentence),
  );
  return {
    checkbox: checkbox as HTMLInputElement,
    label,
    terms: within(label).getByRole("link", {
      name: wrappedBy(sentence, "terms"),
    }),
    privacy: within(label).getByRole("link", {
      name: wrappedBy(sentence, "privacy"),
    }),
  };
}

it("the English sentence reads as before, as plain text", () => {
  expect(plain(enMessages.Registration.agreeToTerms)).toBe(
    "I agree to the Terms of Service and Privacy Policy",
  );
});

describe.each(LOCALES)("%s", (locale) => {
  it("names the checkbox with the plain sentence and links each document to its page", () => {
    const { checkbox, label, terms, privacy } = renderForm(locale);

    expect(checkbox).toHaveAttribute("id", "terms");
    expect(label).toHaveAttribute("for", "terms");
    expect(within(label).getAllByRole("link")).toEqual([terms, privacy]);
    expect(terms).toHaveAttribute("href", `/${locale}/terms`);
    expect(privacy).toHaveAttribute("href", `/${locale}/privacy`);
  });

  it("opens each link in a new tab that gets no handle on this one", () => {
    const { terms, privacy } = renderForm(locale);

    for (const link of [terms, privacy]) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("describes each link as opening a new tab, in a hint that is neither shown nor part of the checkbox's name", () => {
    // renderForm() finds the checkbox by the sentence alone: the hint is no
    // part of its name.
    const { terms, privacy } = renderForm(locale);
    const { opensInNewTab } = MESSAGES[locale].Registration;

    for (const link of [terms, privacy]) {
      expect(link).toHaveAccessibleDescription(opensInNewTab);
      // The name of the link is still the name of the document alone.
      expect(link.textContent).not.toContain(opensInNewTab);
    }
    expect(screen.getByText(opensInNewTab)).not.toBeVisible();
  });
});

// One click in each test: two clicks that both toggled the checkbox would
// leave it as it was.
describe.each(["terms", "privacy"] as const)(
  "a click on the %s link",
  (name) => {
    it("leaves an unticked checkbox unticked", () => {
      const form = renderForm("en");

      fireEvent.click(form[name]);

      expect(form.checkbox.checked).toBe(false);
    });

    it("leaves a ticked checkbox ticked", () => {
      const form = renderForm("en");
      fireEvent.click(form.checkbox);
      expect(form.checkbox.checked).toBe(true);

      fireEvent.click(form[name]);

      expect(form.checkbox.checked).toBe(true);
    });
  },
);

describe("a click on the text of the label", () => {
  it("still ticks the checkbox, and a second one unticks it", () => {
    const { checkbox, label } = renderForm("en");

    fireEvent.click(label);
    expect(checkbox.checked).toBe(true);

    fireEvent.click(label);
    expect(checkbox.checked).toBe(false);
  });
});
