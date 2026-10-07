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

// Every text of the five message files, read as the application reads it:
// with its arguments and tags, by the real next-intl.
//
// `pnpm validate-translations` compares the keys of the files, and
// message-keys.test.ts compares the keys with the code. Neither looks inside
// a text: a translation that renames {provider}, drops {date} or misspells a
// tag has all its keys, and the page shows "{fournisseur}" or nothing where
// the value belongs. Two checks do look:
//   A. every text has the arguments and the tags of the English text of its
//      key, by name;
//   B. every text is formatted by the installed next-intl, with a value for
//      each argument and an element for each tag of the English text,
//      without an error, and what comes out holds every value and no brace
//      and no tag as text.
// The three rich texts are then looked at one by one: the terms sentence of
// the registration form and the two notes of the 2FA set-up dialog. In such
// a text an ASCII apostrophe right before a tag opens a quotation: the tag
// is shown as text and its element is gone ("e l'<privacy>…" in Italian).
// The component tests cannot see that: their stand-in splits a sentence at
// its tags and knows nothing of the quoting of ICU messages.
//
// Jest cannot load next-intl (an ES module; jest.setup.js replaces it with a
// stand-in), so the texts are formatted in a Node process of their own:
// createTranslator(…).rich(…) of the installed next-intl, rendered by
// react-dom/server. What comes back is the HTML of each text.
//
// What A does not see: it reads the arguments with a search, not with the
// parser, so the arguments inside the branches of a plural or a select
// (none of the files has one) are not listed. B formats them all the same,
// but hands every argument a text: a plural would need a number here.

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

interface Texts {
  [key: string]: string | Texts;
}
const leaves = (node: Texts, prefix = ""): [string, string][] =>
  Object.entries(node).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[`${prefix}${key}`, value] as [string, string]]
      : leaves(value, `${prefix}${key}.`),
  );

/** The names of the arguments of a text: "{count}" and "{count, number}". */
const argumentsOf = (message: string) =>
  [...message.matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g)].map((match) => match[1]);

/** The names of the tags of a text, once each: "<em>…</em>" is "em". */
const tagsOf = (message: string) => [
  ...new Set([...message.matchAll(/<(\w+)>/g)].map((match) => match[1])),
];

/** The arguments and the tags of a text as they are written, sorted. */
const marksOf = (message: string) =>
  [
    ...argumentsOf(message).map((name) => `{${name}}`),
    ...(message.match(/<\/?\w+>/g) ?? []),
  ].sort();

/** The value an argument is handed: a text that no message holds. */
const valueOf = (name: string) => `[[${name}]]`;

interface Case {
  locale: string;
  message: string;
  /** The arguments that get a value, and the tags that get an element. */
  values: string[];
  tags: string[];
}
interface Rendered {
  html: string;
  errors: string[];
}

// Each tag becomes an element named after it (<x-terms>…</x-terms>), and the
// text is rendered in a <p>. The cases come on the standard input: together
// the five files are longer than a command line may be.
const FORMAT_WITH_NEXT_INTL = `
import fs from "fs";
import React from "react";
import server from "react-dom/server";
import { createTranslator } from "next-intl";

const cases = JSON.parse(fs.readFileSync(0, "utf8"));
const rendered = cases.map(({ locale, message, values, tags }) => {
  const errors = [];
  const t = createTranslator({
    locale,
    namespace: "Texts",
    messages: { Texts: { text: message } },
    onError: (error) => errors.push(String(error.code)),
  });
  const given = {};
  for (const name of values) given[name] = "[[" + name + "]]";
  for (const name of tags) {
    given[name] = (chunks) => React.createElement("x-" + name, null, chunks);
  }
  let html = "";
  try {
    html = server.renderToStaticMarkup(
      React.createElement("p", null, t.rich("text", given)),
    );
  } catch (error) {
    errors.push("THROWN: " + String(error && error.message));
  }
  return { html, errors };
});
process.stdout.write(JSON.stringify(rendered));
`;

function formatWithNextIntl(cases: Case[]): Rendered[] {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--input-type=module", "-e", FORMAT_WITH_NEXT_INTL],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        input: JSON.stringify(cases),
        maxBuffer: 64 * 1024 * 1024,
      },
    ),
  );
}

/** What react-dom escapes in a text. */
const decoded = (text: string) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** The text of a rendered message, as a reader sees it. */
const textOf = (html: string) => decoded(html.replace(/<\/?(?:p|x-\w+)>/g, ""));

/** What the elements of the tag `name` hold in a rendered message. */
const elementsIn = (html: string, name: string) =>
  [...html.matchAll(new RegExp(`<x-${name}>([^<]*)</x-${name}>`, "g"))].map(
    (match) => decoded(match[1]),
  );

/** A text without its tags, with the value of each argument in its place. */
const expectedText = (message: string) =>
  message
    .replace(/<\/?\w+>/g, "")
    .replace(/\{\s*([A-Za-z_]\w*)\s*\}/g, (_, name: string) => valueOf(name));

// What is wrong with a rendered text, in words; nothing when it is right.
function faultsOf(message: string, english: string, rendered: Rendered) {
  const faults = rendered.errors.map((error) => `error ${error}`);
  const text = textOf(rendered.html);
  if (/[<>{}]/.test(text)) faults.push(`a tag or a brace is left: ${text}`);
  for (const name of argumentsOf(english)) {
    if (!text.includes(valueOf(name))) faults.push(`no value of {${name}}`);
  }
  if (faults.length === 0 && text !== expectedText(message)) {
    faults.push(`reads "${text}"`);
  }
  return faults;
}

const ENGLISH = new Map(leaves(enMessages));

/** The cases of a file: each text with the arguments and tags of the English one. */
const casesOf = (locale: Locale): Case[] =>
  leaves(MESSAGES[locale]).map(([key, message]) => {
    const english = ENGLISH.get(key) ?? message;
    return {
      locale,
      message,
      values: argumentsOf(english),
      tags: tagsOf(english),
    };
  });

// The Italian sentence as it must not be written: an ASCII apostrophe where
// the file has a typographic one.
const ITALIAN_WITH_ASCII_APOSTROPHE =
  itMessages.Registration.agreeToTerms.replace("’<privacy>", "'<privacy>");

// Texts with a known answer: the checks have to find what is wrong with them.
const CONTROLS: Record<string, Case & { english: string }> = {
  right: {
    locale: "fr",
    english: "Link your {provider} account, <em>now</em>",
    message: "Liez votre compte {provider}, <em>maintenant</em>",
    values: ["provider"],
    tags: ["em"],
  },
  renamedArgument: {
    locale: "fr",
    english: "Link your {provider} account",
    message: "Liez votre compte {fournisseur}",
    values: ["provider"],
    tags: [],
  },
  droppedArgument: {
    locale: "de",
    english: "Generated: {date}",
    message: "Erstellt am:",
    values: ["date"],
    tags: [],
  },
  renamedTag: {
    locale: "es",
    english: "The <em>newest</em> entry",
    message: "La entrada <i>más reciente</i>",
    values: [],
    tags: ["em"],
  },
  quotedTag: {
    locale: "it",
    english: enMessages.Registration.agreeToTerms,
    message: ITALIAN_WITH_ASCII_APOSTROPHE,
    values: [],
    tags: ["terms", "privacy"],
  },
};
const CONTROL_NAMES = Object.keys(CONTROLS);

const allCases = LOCALES.flatMap(casesOf);
const allRendered = formatWithNextIntl([
  ...allCases,
  ...CONTROL_NAMES.map((name) => CONTROLS[name]),
]);
const renderedControl = (name: string) =>
  allRendered[allCases.length + CONTROL_NAMES.indexOf(name)];

/** The rendered texts of a file, by key. */
function renderedOf(locale: Locale): Map<string, Rendered> {
  const offset = LOCALES.slice(0, LOCALES.indexOf(locale)).reduce(
    (sum, other) => sum + leaves(MESSAGES[other]).length,
    0,
  );
  return new Map(
    leaves(MESSAGES[locale]).map(([key], index) => [
      key,
      allRendered[offset + index],
    ]),
  );
}

describe("the checks, on texts with a known answer", () => {
  const faultsOfControl = (name: string) =>
    faultsOf(
      CONTROLS[name].message,
      CONTROLS[name].english,
      renderedControl(name),
    );

  it("a text with the arguments and tags of the English one is right", () => {
    const { message, english } = CONTROLS.right;

    expect(marksOf(message)).toEqual(marksOf(english));
    expect(faultsOfControl("right")).toEqual([]);
    expect(textOf(renderedControl("right").html)).toBe(
      "Liez votre compte [[provider]], maintenant",
    );
    expect(elementsIn(renderedControl("right").html, "em")).toEqual([
      "maintenant",
    ]);
  });

  it.each(["renamedArgument", "droppedArgument", "renamedTag"])(
    "%s: the comparison with the English text sees it, and so does the formatter",
    (name) => {
      const { message, english } = CONTROLS[name];

      expect(marksOf(message)).not.toEqual(marksOf(english));
      expect(faultsOfControl(name)).not.toEqual([]);
    },
  );

  it("a tag behind an ASCII apostrophe has its name in place, and only the formatter sees that it is no tag", () => {
    const { message, english } = CONTROLS.quotedTag;

    expect(marksOf(message)).toEqual(marksOf(english));
    expect(faultsOfControl("quotedTag").join(" ")).toMatch(/<privacy>/);
  });

  it("the arguments and tags of a text are read by name", () => {
    expect(
      marksOf("Hi {name}, <b>{count, number}</b> of <i>{total}</i>"),
    ).toEqual(["</b>", "</i>", "<b>", "<i>", "{count}", "{name}", "{total}"]);
    expect(marksOf("No argument: a brace-free text")).toEqual([]);
  });
});

describe.each(LOCALES)("messages/%s.json", (locale) => {
  const texts = leaves(MESSAGES[locale]);
  const rendered = renderedOf(locale);

  it("is read whole, and every text came back from the formatter", () => {
    expect(texts.length).toBeGreaterThan(250);
    expect(rendered.size).toBe(texts.length);
    expect([...rendered.values()].every((one) => one !== undefined)).toBe(true);
    // Some texts do have arguments and tags: the checks below are not idle.
    expect(
      texts.filter(([, text]) => argumentsOf(text).length > 0).length,
    ).toBeGreaterThan(5);
    expect(
      texts.filter(([, text]) => tagsOf(text).length > 0).length,
    ).toBeGreaterThan(2);
  });

  it("A. every text has the arguments and the tags of the English text of its key", () => {
    const different = texts
      .filter(
        ([key, text]) =>
          marksOf(text).join(" ") !== marksOf(ENGLISH.get(key) ?? "").join(" "),
      )
      .map(([key, text]) => [
        key,
        marksOf(text),
        marksOf(ENGLISH.get(key) ?? ""),
      ]);

    expect(different).toEqual([]);
  });

  it("B. the real formatter formats every text: no error, every value in its place, no tag or brace left as text", () => {
    const faulty = texts
      .map(([key, text]): [string, string[]] => {
        const one = rendered.get(key);
        return [
          key,
          one
            ? faultsOf(text, ENGLISH.get(key) ?? text, one)
            : ["not formatted"],
        ];
      })
      .filter(([, faults]) => faults.length > 0);

    expect(faulty).toEqual([]);
  });
});

// The terms sentence of the registration form: the form turns each of its two
// tags into a link to the page of that document.
describe.each(LOCALES)(
  "%s: the terms sentence of the registration form",
  (locale) => {
    const sentence = MESSAGES[locale].Registration.agreeToTerms;
    const one = renderedOf(locale).get("Registration.agreeToTerms");
    const legal = MESSAGES[locale].Legal;

    it("the real formatter makes an element of each document, named as its page is titled", () => {
      expect(one?.errors).toEqual([]);
      expect(elementsIn(one?.html ?? "", "terms")).toEqual([legal.terms.title]);
      expect(elementsIn(one?.html ?? "", "privacy")).toEqual([
        legal.privacy.title,
      ]);
    });

    it("and the label reads as the sentence without its tags: no tag is left as text", () => {
      expect(textOf(one?.html ?? "")).toBe(sentence.replace(/<\/?\w+>/g, ""));
      expect(textOf(one?.html ?? "")).not.toMatch(/[<>]/);
    });
  },
);

describe("the trap that the Italian and the French sentence stand next to", () => {
  it("the Italian file writes a typographic apostrophe before the tag", () => {
    expect(itMessages.Registration.agreeToTerms).toContain("l’<privacy>");
    expect(ITALIAN_WITH_ASCII_APOSTROPHE).toContain("l'<privacy>");
  });

  it("with an ASCII apostrophe there, the real formatter loses the second element and shows the tag", () => {
    const { html } = renderedControl("quotedTag");

    expect(elementsIn(html, "terms")).toEqual([itMessages.Legal.terms.title]);
    expect(elementsIn(html, "privacy")).toEqual([]);
    expect(textOf(html)).toContain("<privacy>");
  });
});

// The two notes of the 2FA set-up dialog: a label in <strong>, and in the tip
// a stressed word and the secret in <code>
// (src/components/security/two-factor-setup.tsx).
const NOTES = ["replaceOldEntryNote", "newestEntryTip"] as const;

describe.each(LOCALES)("%s: the notes of the 2FA set-up dialog", (locale) => {
  const noteOf = (note: (typeof NOTES)[number]) => ({
    message: MESSAGES[locale].TwoFactorSetup[note],
    html: renderedOf(locale).get(`TwoFactorSetup.${note}`)?.html ?? "",
  });

  it("each note opens with its label in bold", () => {
    for (const note of NOTES) {
      const { html, message } = noteOf(note);
      const labels = elementsIn(html, "strong");

      expect(labels).toHaveLength(1);
      expect(labels[0].trim()).not.toBe("");
      expect(expectedText(message).startsWith(labels[0])).toBe(true);
    }
  });

  it("the tip stresses one word and shows the secret as code", () => {
    const { html } = noteOf("newestEntryTip");

    expect(elementsIn(html, "em")).toHaveLength(1);
    expect(elementsIn(html, "em")[0].trim()).not.toBe("");
    expect(elementsIn(html, "code")).toEqual([valueOf("secret")]);
  });
});
