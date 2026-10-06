/**
 * @jest-environment node
 */
import { execFileSync } from "child_process";
import path from "path";
import enMessages from "../../../../messages/en.json";
import esMessages from "../../../../messages/es.json";
import frMessages from "../../../../messages/fr.json";
import itMessages from "../../../../messages/it.json";
import deMessages from "../../../../messages/de.json";

// The terms sentence of the registration form, formatted by the real
// next-intl. In the component tests a stand-in splits the sentence at its
// tags; it knows nothing of the quoting of ICU messages. There an ASCII
// apostrophe right before a tag opens a quotation: the tag is shown as text
// and the link is gone ("e l'<privacy>…" in Italian, "…d'<tag>" in French).
//
// Jest cannot load next-intl (an ES module; jest.setup.js replaces it with a
// stand-in), so the sentences are formatted in a Node process of their own:
// createTranslator(…).rich(…) of the installed next-intl, with a link for
// each tag as the form gives it, rendered by react-dom/server. What comes
// back is the HTML of the label.

const REPO_ROOT = path.resolve(__dirname, "../../../..");

const MESSAGES = {
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  it: itMessages,
  de: deMessages,
};
type Locale = keyof typeof MESSAGES;
const LOCALES = Object.keys(MESSAGES) as Locale[];

interface Case {
  locale: string;
  message: string;
}
interface Rendered {
  html: string;
  errors: string[];
}

const FORMAT_WITH_NEXT_INTL = `
import React from "react";
import server from "react-dom/server";
import { createTranslator } from "next-intl";

const cases = JSON.parse(process.argv[1]);
const rendered = cases.map(({ locale, message }) => {
  const errors = [];
  const t = createTranslator({
    locale,
    namespace: "Registration",
    messages: { Registration: { agreeToTerms: message } },
    onError: (error) => errors.push(String(error.code)),
  });
  const link = (document) => (name) =>
    React.createElement("a", { href: "/" + locale + "/" + document }, name);
  const sentence = t.rich("agreeToTerms", {
    terms: link("terms"),
    privacy: link("privacy"),
  });
  return {
    html: server.renderToStaticMarkup(
      React.createElement("label", null, sentence),
    ),
    errors,
  };
});
process.stdout.write(JSON.stringify(rendered));
`;

function formatWithNextIntl(cases: Case[]): Rendered[] {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        FORMAT_WITH_NEXT_INTL,
        JSON.stringify(cases),
      ],
      { cwd: REPO_ROOT, encoding: "utf8" },
    ),
  );
}

/** The links of a rendered label: [href, text]. */
const linksIn = (html: string) =>
  [...html.matchAll(/<a href="([^"]*)">([^<]*)<\/a>/g)].map((match) => [
    match[1],
    decoded(match[2]),
  ]);

/** The text of a rendered label, as a reader sees it. */
const textOf = (html: string) =>
  decoded(html.replace(/<\/?(?:label|a)[^>]*>/g, ""));

/** What react-dom escapes in a text. */
const decoded = (text: string) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** The sentence without its tags. */
const plain = (message: string) => message.replace(/<\/?\w+>/g, "");

// The Italian sentence as it must not be written: an ASCII apostrophe where
// the file has a typographic one.
const ITALIAN_WITH_ASCII_APOSTROPHE =
  itMessages.Registration.agreeToTerms.replace("’<privacy>", "'<privacy>");

const rendered = formatWithNextIntl([
  ...LOCALES.map((locale) => ({
    locale,
    message: MESSAGES[locale].Registration.agreeToTerms,
  })),
  { locale: "it", message: ITALIAN_WITH_ASCII_APOSTROPHE },
]);

describe.each(LOCALES)("%s", (locale) => {
  const { html, errors } = rendered[LOCALES.indexOf(locale)];
  const legal = MESSAGES[locale].Legal;

  it("the real formatter makes a link of each document, named as its page is titled", () => {
    expect(errors).toEqual([]);
    expect(linksIn(html)).toEqual([
      [`/${locale}/terms`, legal.terms.title],
      [`/${locale}/privacy`, legal.privacy.title],
    ]);
  });

  it("and the label reads as the sentence without its tags: no tag is left as text", () => {
    expect(textOf(html)).toBe(
      plain(MESSAGES[locale].Registration.agreeToTerms),
    );
    expect(textOf(html)).not.toMatch(/[<>]/);
  });
});

describe("the trap that the Italian and the French sentence stand next to", () => {
  it("the Italian file writes a typographic apostrophe before the tag", () => {
    expect(itMessages.Registration.agreeToTerms).toContain("l’<privacy>");
    expect(ITALIAN_WITH_ASCII_APOSTROPHE).toContain("l'<privacy>");
  });

  it("with an ASCII apostrophe there, the real formatter loses the second link and shows the tag", () => {
    const { html } = rendered[LOCALES.length];

    expect(linksIn(html)).toEqual([
      ["/it/terms", itMessages.Legal.terms.title],
    ]);
    expect(textOf(html)).toContain("<privacy>");
  });
});
