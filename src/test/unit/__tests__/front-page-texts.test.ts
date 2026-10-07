/**
 * @jest-environment node
 */
import enMessages from "../../../../messages/en.json";
import esMessages from "../../../../messages/es.json";
import frMessages from "../../../../messages/fr.json";
import itMessages from "../../../../messages/it.json";
import deMessages from "../../../../messages/de.json";

// Texts of the first pages a visitor sees, read in the five message files.
// `pnpm validate-translations` compares the keys of the files, and
// message-keys.test.ts compares the keys with the code; neither reads a text.
// These checks do, for what a text has to hold whatever its wording is:
//   - the line under the title of the home page exists twice, and only the
//     one for a server with Google sign-in names Google;
//   - the terms sentence of the registration form marks the names of its two
//     documents, which the form turns into links, and each name is the title
//     of the page that the link opens.
//   - no message has an ASCII apostrophe right before a tag or an argument:
//     in an ICU message that apostrophe opens a quotation, and the tag is
//     shown as text (rich-messages.real-formatter.test.ts asks the real
//     formatter).
// Some texts are compared word for word, because their wording was decided:
// the English line that the owner chose, a German sentence that was not
// German, the names of the two documents, and the word for "placeholder".

const MESSAGES = {
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  it: itMessages,
  de: deMessages,
};
type Locale = keyof typeof MESSAGES;
const LOCALES = Object.keys(MESSAGES) as Locale[];
const TRANSLATIONS = LOCALES.filter((locale) => locale !== "en");

/** The tags of a rich text, in the order they are written: "<a>", "</a>". */
const tagsOf = (message: string) => message.match(/<\/?\w+>/g) ?? [];

/** What the tag `name` of a rich text wraps. */
const wrappedBy = (message: string, name: string) =>
  new RegExp(`<${name}>(.*?)</${name}>`).exec(message)?.[1];

describe("the line under the title of the home page", () => {
  it("is the owner's sentence in English, and has a second form without Google", () => {
    expect(enMessages.Home.subtitle).toBe(
      "Sign in with Google, or with e-mail and password",
    );
    expect(enMessages.Home.subtitleWithoutGoogle).toBe(
      "Sign in with e-mail and password",
    );
  });

  it.each(LOCALES)("%s: only the form for Google names Google", (locale) => {
    const { subtitle, subtitleWithoutGoogle } = MESSAGES[locale].Home;

    expect(subtitle).toMatch(/Google/);
    expect(subtitleWithoutGoogle.trim()).not.toBe("");
    expect(subtitleWithoutGoogle).not.toMatch(/google|oauth/i);
    // Neither form is the claim that the line used to make.
    expect(subtitle).not.toMatch(/oauth/i);
  });

  it.each(TRANSLATIONS)("%s: both forms are translated", (locale) => {
    const { subtitle, subtitleWithoutGoogle } = MESSAGES[locale].Home;

    expect(subtitle).not.toBe(enMessages.Home.subtitle);
    expect(subtitleWithoutGoogle).not.toBe(
      enMessages.Home.subtitleWithoutGoogle,
    );
  });
});

describe("the footer line of the German home page", () => {
  it("is a German sentence", () => {
    expect(deMessages.Home.secureAuth).toBe(
      "Sichere Authentifizierung mit branchenüblicher Verschlüsselung",
    );
  });
});

describe("wordings that were decided", () => {
  it('the Italian and the French file write "email", as they do everywhere else', () => {
    for (const messages of [itMessages, frMessages]) {
      const text = JSON.stringify(messages);

      expect(text).not.toMatch(/e-mail/i);
      // The same search reads the file: the word is there in its own spelling.
      expect(text).toMatch(/email/i);
    }
    expect(itMessages.Home.subtitle).toBe(
      "Accedi con Google, oppure con email e password",
    );
    expect(frMessages.Home.subtitle).toBe(
      "Connectez-vous avec Google, ou par email et mot de passe",
    );
  });

  it("names the two documents as they are called in each language", () => {
    expect([
      itMessages.Legal.terms.title,
      itMessages.Legal.privacy.title,
    ]).toEqual(["Termini di Servizio", "Informativa sulla Privacy"]);
    expect([
      frMessages.Legal.terms.title,
      frMessages.Legal.privacy.title,
    ]).toEqual(["Conditions d'utilisation", "Politique de confidentialité"]);
    expect([
      deMessages.Legal.terms.title,
      deMessages.Legal.privacy.title,
    ]).toEqual(["Nutzungsbedingungen", "Datenschutzerklärung"]);
  });

  it("calls the text of the two pages a placeholder or a sample, not a provisional text", () => {
    const named = LOCALES.map((locale) => [
      locale,
      MESSAGES[locale].Legal.placeholderTitle,
    ]);

    expect(named).toEqual([
      ["en", "Placeholder text"],
      ["es", "Texto de ejemplo"],
      ["fr", "Texte d'exemple"],
      ["it", "Testo segnaposto"],
      ["de", "Platzhaltertext"],
    ]);
    // The notice uses the same words for it.
    for (const locale of LOCALES) {
      const { placeholderTitle, placeholderNotice } = MESSAGES[locale].Legal;

      expect(placeholderNotice.toLowerCase()).toContain(
        placeholderTitle.toLowerCase(),
      );
    }
  });

  it("the French footer line says chiffrement, and not word for word what the English one says", () => {
    // "standard de l'industrie" copied "industry-standard".
    expect(frMessages.Home.secureAuth).toBe(
      "Authentification sécurisée, chiffrement conforme aux standards du secteur",
    );
  });
});

describe("quoting in the message files", () => {
  interface Texts {
    [key: string]: string | Texts;
  }
  const leaves = (node: Texts, prefix = ""): [string, string][] =>
    Object.entries(node).flatMap(([key, value]) =>
      typeof value === "string"
        ? [[`${prefix}${key}`, value] as [string, string]]
        : leaves(value, `${prefix}${key}.`),
    );
  // An ASCII apostrophe right before "<" or "{" opens a quotation.
  const QUOTED = /'[<{]/;

  it("the search finds the trap in a sentence that has it", () => {
    expect("e l'<privacy>Informativa</privacy>").toMatch(QUOTED);
    expect("e l’<privacy>Informativa</privacy>").not.toMatch(QUOTED);
    expect("J'accepte les <terms>Conditions</terms>").not.toMatch(QUOTED);
  });

  it.each(LOCALES)(
    "%s: no message has an ASCII apostrophe right before a tag or an argument",
    (locale) => {
      const all = leaves(MESSAGES[locale]);
      expect(all.length).toBeGreaterThan(100);

      expect(all.filter(([, text]) => QUOTED.test(text))).toEqual([]);
    },
  );
});

describe("the terms sentence of the registration form", () => {
  it.each(LOCALES)(
    "%s: marks the two documents, each once, the terms first",
    (locale) => {
      const sentence = MESSAGES[locale].Registration.agreeToTerms;

      expect(tagsOf(sentence)).toEqual([
        "<terms>",
        "</terms>",
        "<privacy>",
        "</privacy>",
      ]);
    },
  );

  it.each(LOCALES)(
    "%s: names each document as the page of that document is titled",
    (locale) => {
      const sentence = MESSAGES[locale].Registration.agreeToTerms;
      const legal = MESSAGES[locale].Legal;

      expect(wrappedBy(sentence, "terms")).toBe(legal.terms.title);
      expect(wrappedBy(sentence, "privacy")).toBe(legal.privacy.title);
      expect(legal.terms.title.trim()).not.toBe("");
      expect(legal.privacy.title.trim()).not.toBe("");
    },
  );
});
