/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";
import enMessages from "../../../../messages/en.json";
import esMessages from "../../../../messages/es.json";
import frMessages from "../../../../messages/fr.json";
import itMessages from "../../../../messages/it.json";
import deMessages from "../../../../messages/de.json";

// Conventions guard. After v2.5.2 an editor for each language read every
// text and removed what was copied word for word from English, what was
// written in English title case and what promised a support team that the
// kit does not have (CONTRIBUTING.md, "Conventions of each language"). These
// checks keep a list of the wordings that were removed from coming back.
//
// It is a list of narrow searches, not a proof-reader:
//   - A text can break a convention and pass. A wording is searched for in
//     the shape that v2.5.2 had it in, and what needs a reader is not here: a
//     capital inside a sentence that may be a name, "2FA" without its
//     article, an infinitive that may be a noun, the Spanish "en su lugar"
//     for "instead" (it also means "in its place").
//   - A correct text can match. None is known that does: each pattern was
//     narrowed until the correct look-alikes that were tried pass (`allowed`).
//     If a correct text is caught one day, narrow the pattern and add the
//     text to `allowed`; do not reword the text.
//
// A search that finds nothing proves nothing by itself, so every pattern
// comes with texts of v2.5.2 in which it was found (`removed`, copied from
// `git show v2.5.2:messages/<locale>.json`), and some with other wrong texts
// that it has to find as well (`stillWrong`).
//
// An address is no word of a text: "https://…?lang=fr", "mailto:…" and
// "name@email.com" are taken out before a text is searched.

jest.mock("resend", () => ({ Resend: jest.fn() }));

import {
  createEmailVerificationTemplate,
  createSecurityAlertTemplate,
} from "@/lib/email";

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

const NBSP = "\u00a0";
// The narrow no-break space: what a French typographer puts before "?", "!"
// and ";". The files of this repository write U+00A0; both are right.
const NARROW_NBSP = "\u202f";

/**
 * A text without its arguments and tags ("{email}" is no word of the text)
 * and without the addresses it names.
 */
const bare = (message: string) =>
  message
    .replace(/\{[^{}]*\}|<\/?\w+>/g, "§")
    .replace(/(?:https?:\/\/|mailto:)\S+/gi, "§")
    .replace(/\S+@\S+\.\S+/g, "§");

// A word boundary that knows accented letters ("\b" takes "É" for no letter).
const START = "(?<![\\p{L}\\p{N}])";
const END = "(?![\\p{L}\\p{N}])";

/** Finds the words of `source` as whole words, whatever their capitals. */
const words = (source: string, flags = "iu") => {
  const pattern = new RegExp(`${START}(?:${source})${END}`, flags);
  return (message: string) => pattern.test(bare(message));
};

/** Finds `pattern` anywhere in the text. */
const matching = (pattern: RegExp) => (message: string) =>
  pattern.test(bare(message));

/**
 * French: a "?", "!", ":" or ";" without a no-break space before it, or a
 * guillemet without one inside. The colon of a time ("12:30") is not
 * punctuation, and an address is no part of the text (see `bare`).
 */
function frenchMarkWithoutNoBreakSpace(message: string): boolean {
  const text = bare(message);
  for (const found of text.matchAll(/[?!:;]/g)) {
    const before = text[found.index - 1] ?? "";
    const after = text[found.index + 1] ?? "";
    if (found[0] === ":" && /\d/.test(before) && /\d/.test(after)) continue;
    if (before !== NBSP && before !== NARROW_NBSP) return true;
  }
  return /«(?![\u00a0\u202f])|(?<![\u00a0\u202f])»/.test(text);
}

// The imperatives of the file in the "usted" form. At the start of a
// sentence such a form is an order to "usted"; the file says "tú".
const SPANISH_USTED_IMPERATIVES = [
  "revise",
  "escriba",
  "ingrese",
  "introduzca",
  "verifique",
  "intente",
  "inicie",
  "descargue",
  "use",
  "añada",
  "vincule",
  "póngase",
  "solicite",
  "elija",
  "abra",
  "complete",
  "cambie",
  "guarde",
  "haga",
  "gestione",
  "acceda",
  "establezca",
  "configure",
  "recargue",
  "vuelva",
  "contacte",
  "seleccione",
  "confirme",
].join("|");

// German participles, adjectives and adverbs that v2.5.2 wrote with a capital
// inside a heading, as English title case does. After a letter and a space
// such a word is lower case; a noun made of a verb ("das Löschen") can be
// right with a capital, so no infinitive is in the list.
const GERMAN_NEVER_CAPITALISED = [
  "Existiert",
  "Bereits",
  "Verweigert",
  "Nicht",
  "Verknüpft",
  "Erfolgreich",
  "Verifiziert",
  "Fehlgeschlagen",
].join("|");

interface Pattern {
  /** What the convention says. */
  rule: string;
  found: (message: string) => boolean;
  /** Texts of v2.5.2 that had it: [key, text]. */
  removed: [string, string][];
  /** Other texts that break the rule, in a shape v2.5.2 did not have. */
  stillWrong?: string[];
  /** Correct texts that look like a match. */
  allowed?: string[];
}

// "log in" is a verb after these words, and before those. "the security log
// in your account settings" is a noun and a preposition.
const ENGLISH_LOG_IN = new RegExp(
  [
    // One word, with a hyphen, or the participle.
    `${START}(?:log-?ins?|log-?outs?|logged (?:in|out))${END}`,
    // At the start of a sentence, or after a word that a verb follows.
    `(?:^|[.!?] |${START}(?:to|please|and|or|then|you|can|cannot|must|will) )log (?:in|out)${END}`,
    // Before a word that follows a verb, or at the end of a clause.
    `${START}log (?:in|out)(?= (?:to|with|using|again|here|now|first)${END}|[.,!?]|$)`,
  ].join("|"),
  "iu",
);

const PATTERNS: Record<Locale, Pattern[]> = {
  en: [
    {
      rule: 'the word is "sign in", never "log in" or "login"',
      found: matching(ENGLISH_LOG_IN),
      removed: [
        [
          "Account.twoFactorSecurityDescription",
          "Two-factor authentication significantly increases your account security by requiring a second verification step during login.",
        ],
      ],
      stillWrong: [
        "Please log in again.",
        "Log in with Google",
        "You are logged in",
        "Log out",
      ],
      allowed: [
        "See the security log in your account settings",
        "The log information is kept for 30 days",
        "Open the catalog",
      ],
    },
    {
      rule: '"setup" is the noun; the verb is "set up"',
      found: words("to setup (?:the|your|a|an|two-factor|2FA)"),
      removed: [
        [
          "Errors.failedToSetupTwoFactor",
          "Failed to setup two-factor authentication",
        ],
        [
          "ComponentErrors.failedToSetupTwoFactor",
          "Failed to setup 2FA. Please try again.",
        ],
      ],
      allowed: ["Go back to setup", "Complete Setup"],
    },
    {
      rule: "no text sends the reader to a support team: the kit has none",
      found: words(
        "contact(?:ing)? (?:our |the )?support|(?:our|the|your|a) support team",
      ),
      removed: [
        [
          "Auth.error.configurationErrorDetails",
          "Please contact support if this issue persists.",
        ],
        ["EmailVerification.needHelp", "Need help? Contact our support team."],
      ],
      stillWrong: ["Ask the support team."],
      allowed: [
        "Your browser does not support this feature",
        "Your browser does not support team accounts yet",
      ],
    },
  ],
  it: [
    {
      rule: 'no "Per favore" before an imperative',
      found: words("per favore"),
      removed: [
        [
          "Errors.tooManyAttempts",
          "Troppi tentativi. Per favore riprova tra qualche minuto.",
        ],
      ],
    },
    {
      rule: 'no "Si prega di"',
      found: words("si prega"),
      removed: [
        [
          "validation.form.validationError",
          "Si prega di controllare il modulo per errori",
        ],
      ],
    },
    {
      rule: '"attivare / disattivare", not "abilitare / disabilitare"',
      found: words(
        "(?:dis)?abilit(?:a|i|o|are|ato|ata|ati|ate|ano|ando|azione)",
      ),
      removed: [
        ["Account.enabled", "Abilitato"],
        ["Account.disableTwoFactor", "Disabilita 2FA"],
      ],
      allowed: ["Le abilità richieste", "Accessibile a persone con disabilità"],
    },
    {
      rule: '"non valido", not "invalido"',
      found: words("invalid[oaie]"),
      removed: [
        [
          "EmailVerification.defaultFailureMessage",
          "Il link di verifica è invalido o è scaduto.",
        ],
      ],
    },
    {
      rule: 'no "invece" at the end of a sentence',
      found: matching(/(?<![\p{L}\p{N}])invece[.!]?$/iu),
      removed: [
        ["Auth.signInWithGoogleInstead", "Accedi con Google invece"],
        [
          "Errors.userAlreadyHasPassword",
          "L'utente ha già una password. Usa cambia password invece.",
        ],
      ],
      allowed: ["Accedi invece con Google"],
    },
    {
      rule: "no text sends the reader to a support team: the kit has none",
      found: words("il support|team di supporto"),
      removed: [
        [
          "Auth.error.configurationErrorDetails",
          "Per favore contatta il support se questo problema persiste.",
        ],
        [
          "EmailVerification.needHelp",
          "Hai bisogno di aiuto? Contatta il nostro team di supporto.",
        ],
      ],
    },
  ],
  es: [
    {
      rule: 'no "Por favor"',
      found: words("por favor"),
      removed: [
        [
          "Errors.tooManyAttempts",
          "Demasiados intentos. Por favor intenta de nuevo en unos minutos.",
        ],
      ],
    },
    {
      rule: 'the reader is "tú": no sentence opens with an imperative for "usted"',
      found: matching(
        new RegExp(
          `(?:^|[.!?] )(?:por favor,? )?(?:${SPANISH_USTED_IMPERATIVES})${END}`,
          "iu",
        ),
      ),
      removed: [
        [
          "validation.form.validationError",
          "Por favor revise el formulario para errores",
        ],
      ],
      allowed: [
        "Revisa los errores del formulario",
        "Espera a que el administrador revise tu cuenta",
      ],
    },
    {
      rule: '"successfully" is "correctamente"',
      found: words("exitosamente"),
      removed: [["Success.accountDeleted", "Cuenta eliminada exitosamente"]],
    },
    {
      rule: '"Failed to X" is "No se pudo ...": no sentence opens with "Falló al"',
      found: matching(new RegExp(`(?:^|[.!?¡¿] ?)fall[oó] al${END}`, "iu")),
      removed: [
        ["Account.failedToLinkAccount", "Falló al vincular la cuenta"],
        [
          "Errors.failedToDeleteAccount",
          "Falló al eliminar la cuenta. Por favor intenta de nuevo.",
        ],
      ],
      allowed: [
        "Si la verificación falló al primer intento, inténtalo de nuevo.",
      ],
    },
    {
      rule: '"correo electrónico", never "email"',
      found: words("e-?mails?"),
      removed: [
        ["Auth.signInWithEmail", "Iniciar sesión con Email"],
        ["Account.emailPassword", "Email y Contraseña"],
      ],
      allowed: [
        "Escribe tu correo electrónico para confirmar: {email}",
        "Por ejemplo: nombre@email.com",
      ],
    },
    {
      rule: '"panel de control", not "dashboard"',
      found: words("dashboard"),
      removed: [["Auth.goToDashboard", "Ir al Dashboard"]],
    },
    {
      rule: '"activar / desactivar", not "habilitar / deshabilitar"',
      found: matching(/(?<![\p{L}\p{N}])(?:des)?habilit/iu),
      removed: [
        ["Account.enabled", "Habilitado"],
        ["Account.disableTwoFactor", "Deshabilitar 2FA"],
      ],
      allowed: ["Una habilidad nueva"],
    },
    {
      rule: '"Escribe", not the regional "Ingresa"',
      found: matching(/(?<![\p{L}\p{N}])ingres[ae]/iu),
      removed: [
        ["Auth.enterCredentials", "Ingresa tus credenciales para continuar"],
      ],
      allowed: ["Los ingresos del mes"],
    },
    {
      rule: '"no válido", not "inválido"',
      found: matching(/(?<![\p{L}\p{N}])inválid/iu),
      removed: [
        ["Errors.invalidVerificationToken", "Token de verificación inválido"],
      ],
    },
    {
      rule: '"obligatoria", not "requerida"',
      found: words("requerid[oa]s?"),
      removed: [["Account.passwordRequired", "La contraseña es requerida"]],
      allowed: ["al requerir un segundo paso de verificación"],
    },
    {
      rule: 'no "¿Estás seguro...?"',
      found: matching(/¿estás segur[oa]/iu),
      removed: [
        [
          "Account.disableTwoFactorConfirm",
          "¿Estás seguro de que quieres deshabilitar la autenticación de dos factores? Esto hará que tu cuenta sea menos segura.",
        ],
      ],
    },
    {
      rule: '"Ponte en contacto con", not "Contacta a"',
      found: words("contactar? al?"),
      removed: [
        [
          "EmailVerification.needHelp",
          "¿Necesitas ayuda? Contacta a nuestro equipo de soporte.",
        ],
      ],
      stillWrong: ["Contacta al administrador del sitio."],
      allowed: ["Ponte en contacto con el administrador del sitio."],
    },
    {
      rule: "no text sends the reader to a support team: the kit has none",
      found: words(
        "contacta\\p{L}* (?:a |con )?(?:el |nuestro )?soporte|equipo de soporte",
      ),
      removed: [
        [
          "Auth.error.configurationErrorDetails",
          "Por favor contacta soporte si este problema persiste.",
        ],
        [
          "EmailVerification.needHelp",
          "¿Necesitas ayuda? Contacta a nuestro equipo de soporte.",
        ],
      ],
    },
  ],
  fr: [
    {
      rule: '"Failed to X" is "Impossible de ...": no sentence opens with "Échec de ..."',
      found: matching(/(?:^|[.!?][ \u00a0\u202f])[ÉE]chec (?:de|du|des|d')/u),
      removed: [
        ["Errors.failedToVerifyEmail", "Échec de la vérification de l'email"],
        [
          "Errors.failedToChangePassword",
          "Échec du changement de mot de passe. Veuillez réessayer.",
        ],
      ],
      stillWrong: ["Compte introuvable. Échec de la connexion."],
      allowed: ["En cas d'échec de la vérification, veuillez réessayer."],
    },
    {
      rule: "a no-break space before ? ! : ; and inside « »",
      found: frenchMarkWithoutNoBreakSpace,
      removed: [
        ["Auth.alreadyHaveAccount", "Vous avez déjà un compte?"],
        ["Home.welcomeBack", "Bon retour, {name}!"],
        ["Auth.error.howToResolve", "Comment résoudre ceci:"],
        // With an ordinary space, which a line break can separate.
        ["TwoFactorSetup.requirementsTitle", "Ce dont vous aurez besoin :"],
      ],
      stillWrong: ["Choisissez «Lier le compte»."],
      allowed: [
        `Vous avez déjà un compte${NBSP}?`,
        `Vous avez déjà un compte${NARROW_NBSP}?`,
        `Choisissez «${NBSP}Lier le compte${NBSP}».`,
        "Voir https://example.com/aide?lang=fr",
        "Écrivez à mailto:aide@example.com",
        "Ouvert de 9:00 à 17:30",
      ],
    },
    {
      rule: 'no "avec succès": the message of a success says it already',
      found: words("avec succès"),
      removed: [["Success.profileUpdated", "Profil mis à jour avec succès"]],
    },
    {
      rule: '"jeton", not "token"',
      found: words("tokens?"),
      removed: [
        [
          "Errors.verificationTokenExpired",
          "Le token de vérification a expiré",
        ],
      ],
    },
    {
      rule: '"codes de secours", not "codes de sauvegarde"',
      found: words("codes? de sauvegarde"),
      removed: [
        [
          "Account.backupCodesAvailable",
          "{count} codes de sauvegarde disponibles",
        ],
      ],
    },
    {
      rule: 'a set-up is finished with "terminer", not with "compléter"',
      found: words(
        "compl[ée]t(?:er|ez|é|ée|és|ées) (?:la|votre|cette|sa|leur) configuration",
      ),
      removed: [
        ["TwoFactorSetup.completeSetup", "Compléter la Configuration"],
        [
          "EmailVerification.metaDescription",
          "Vérifiez votre adresse email pour compléter la configuration de votre compte.",
        ],
      ],
      allowed: [
        "Nom complet",
        "Une adresse complète",
        // To fill in a form is "compléter" in French.
        "Veuillez compléter tous les champs du formulaire.",
      ],
    },
    {
      rule: '"lier / délier": no "déliaison"',
      found: words("déliaison"),
      removed: [
        ["Account.failedToUnlinkAccount", "Échec de la déliaison de compte"],
      ],
    },
    {
      rule: '"par email", not "avec email"',
      found: words("avec email"),
      removed: [["Auth.signInWithEmail", "Se connecter avec Email"]],
      allowed: ["Vous avez déjà créé un compte avec un email"],
    },
    {
      rule: "no text sends the reader to a support team: the kit has none",
      found: words("contacte[rz] (?:le |notre )support|équipe de support"),
      removed: [
        [
          "Auth.error.configurationErrorDetails",
          "Veuillez contacter le support si ce problème persiste.",
        ],
        [
          "EmailVerification.needHelp",
          "Besoin d'aide? Contactez notre équipe de support.",
        ],
      ],
    },
  ],
  de: [
    {
      rule: '"E-Mail", with its hyphen and two capitals, in a compound too',
      // No boundary after the word: "Emailadresse" and "Emails" are the
      // same mistake. "Emaille" is enamel.
      found: matching(/(?<![\p{L}\p{N}-])(?:Email(?!l)|E-mail|EMail|eMail)/u),
      removed: [["Account.emailPassword", "Email und Passwort"]],
      stillWrong: ["Ihre Emailadresse", "Zu viele Emails", "Email-Adresse"],
      allowed: [
        "E-Mail und Passwort",
        "Geben Sie Ihre E-Mail-Adresse ein",
        "Zu viele E-Mails",
        "Zum Beispiel name@email.de",
      ],
    },
    {
      rule: 'compounds of two German nouns are one word: "Kontoverknüpfung", "Passwortverwaltung"',
      found: matching(/Konto-Verknüpfung|Passwort-Verwaltung/),
      removed: [
        ["Account.accountLinking", "Konto-Verknüpfung"],
        ["Account.passwordManagement", "Passwort-Verwaltung"],
      ],
    },
    {
      rule: '"schiefgelaufen" is one word',
      found: words("schief gelaufen", "u"),
      removed: [["CredentialsForm.genericError", "Etwas ist schief gelaufen"]],
    },
    {
      rule: 'no comma before "etc."',
      found: matching(/, etc\./),
      removed: [
        [
          "TwoFactorSetup.authenticatorApp",
          "Eine Authenticator-App (Google Authenticator, Authy, etc.)",
        ],
      ],
    },
    {
      rule: "only nouns have a capital: no participle, adjective or adverb in title case",
      found: matching(
        new RegExp(
          `(?<=[\\p{L}\\p{N},)]) (?:${GERMAN_NEVER_CAPITALISED})(?![\\p{L}-])`,
          "u",
        ),
      ),
      removed: [
        ["Auth.error.accountAlreadyExists", "Konto Existiert Bereits"],
        ["Auth.error.linkNotConfirmed", "Google-Konto Nicht Verknüpft"],
        [
          "EmailVerification.successTitle",
          "E-Mail Erfolgreich Verifiziert! ✅",
        ],
        ["EmailVerification.failureTitle", "Verifizierung Fehlgeschlagen ❌"],
      ],
      allowed: [
        "Konto existiert bereits",
        // The first word of a sentence, of a line after a symbol and of a
        // quoted label.
        "Die Anmeldung ist fehlgeschlagen. Nicht jedes Konto ist betroffen.",
        "Status: Verifiziert",
        "✅ Verifiziert",
        "Der Status lautet „Nicht verknüpft“.",
      ],
    },
    {
      rule: "no text sends the reader to a support team: the kit has none",
      found: words("den Support|Support-Team", "u"),
      removed: [
        [
          "Auth.error.configurationErrorDetails",
          "Bitte kontaktieren Sie den Support, wenn dieses Problem weiterhin besteht.",
        ],
        [
          "EmailVerification.needHelp",
          "Benötigen Sie Hilfe? Kontaktieren Sie unser Support-Team.",
        ],
      ],
    },
  ],
};

describe.each(LOCALES)("messages/%s.json", (locale) => {
  const texts = leaves(MESSAGES[locale]);

  it("is read whole", () => {
    expect(texts.length).toBeGreaterThan(250);
    expect(PATTERNS[locale].length).toBeGreaterThan(2);
  });

  describe.each(PATTERNS[locale])("$rule", (pattern) => {
    const { found, removed, stillWrong, allowed } = pattern;

    it("the search finds it in the texts of v2.5.2 that had it", () => {
      expect(removed.length).toBeGreaterThan(0);
      expect(removed.filter(([, text]) => !found(text))).toEqual([]);
    });

    if (stillWrong) {
      it("the search finds it in another shape as well", () => {
        expect(stillWrong.length).toBeGreaterThan(0);
        expect(stillWrong.filter((text) => !found(text))).toEqual([]);
      });
    }

    if (allowed) {
      it("the search leaves a correct text alone", () => {
        expect(allowed.length).toBeGreaterThan(0);
        expect(allowed.filter((text) => found(text))).toEqual([]);
      });
    }

    it("no text of the file has it", () => {
      expect(texts.filter(([, text]) => found(text))).toEqual([]);
    });
  });
});

// The number of codes stands after its noun, behind a colon: "{count} backup
// codes available" was wrong for one code in every language ("1 backup
// codes"), and the line needs no plural form this way.
describe("the line that counts the backup codes", () => {
  /** Whether the text is a noun phrase, a colon and the count, in this order. */
  const countsAfterAColon = (text: string) =>
    /^[^{}]*[^{}\s\u00a0][ \u00a0]?: \{count\}$/.test(text);

  it("the search tells the two forms apart", () => {
    expect(countsAfterAColon("Backup codes available: {count}")).toBe(true);
    expect(countsAfterAColon(`Codes disponibles${NBSP}: {count}`)).toBe(true);
    // The text of v2.5.2, and a second argument that would need a plural.
    expect(countsAfterAColon("{count} backup codes available")).toBe(false);
    expect(countsAfterAColon("{used} of the codes used: {count}")).toBe(false);
  });

  it.each(LOCALES)("%s: a noun phrase, a colon, the count", (locale) => {
    expect(
      countsAfterAColon(MESSAGES[locale].Account.backupCodesAvailable),
    ).toBe(true);
  });
});

// In messages/fr.json the no-break space is written as the escape \u00a0: the
// character itself looks like a space in an editor and in a diff. The same
// holds for the narrow one (\u202f), which no file uses today. The parsed
// texts are the same either way, so this check reads the files as text.
describe("how the no-break space is written", () => {
  const RAW = /[\u00a0\u202f]/;
  const ESCAPED = /\\u00a0/;

  it("the search tells the two characters from their escapes", () => {
    expect(`"a${NBSP}?"`).toMatch(RAW);
    expect(`"a${NARROW_NBSP}?"`).toMatch(RAW);
    expect('"a\\u00a0?"').not.toMatch(RAW);
    expect('"a\\u202f?"').not.toMatch(RAW);
    expect('"a\\u00a0?"').toMatch(ESCAPED);
  });

  it.each(LOCALES)("messages/%s.json holds no raw no-break space", (locale) => {
    const text = fs.readFileSync(
      path.join(REPO_ROOT, "messages", `${locale}.json`),
      "utf8",
    );

    expect(text.length).toBeGreaterThan(1000);
    expect(RAW.test(text)).toBe(false);
  });

  it("messages/fr.json writes it as the escape", () => {
    const text = fs.readFileSync(
      path.join(REPO_ROOT, "messages", "fr.json"),
      "utf8",
    );

    expect(ESCAPED.test(text)).toBe(true);
  });
});

// The verification e-mail has its texts in src/lib/email.ts, in the same five
// languages, and v2.5.2 had the same patterns there ("Per favore clicca ...",
// "Por favor haz clic ..."). The same searches read the mail as a reader
// gets it: the subject, the text of the HTML and the text part, without the
// address of the link. The security alert has English texts only, and no
// text part.
describe("the texts of the e-mails", () => {
  const LINK = "https://app.example.com/verify-email/a1B2c3";

  /** A text on one line, without the address of the link. */
  const onOneLine = (text: string) =>
    text
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[ \t\r\n]+/g, " ")
      .trim();

  /** The text of an HTML mail: no style sheet, no tags, no address. */
  const readable = (html: string) =>
    onOneLine(
      html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " "),
    );

  const faults = (locale: Locale, text: string) =>
    PATTERNS[locale].filter(({ found }) => found(text)).map(({ rule }) => rule);

  it("the searches find the sentences that the mail of v2.5.2 had", () => {
    expect(
      faults(
        "it",
        "Per favore clicca sul pulsante qui sotto per verificare il tuo indirizzo email.",
      ),
    ).toHaveLength(1);
    expect(
      faults(
        "es",
        "Por favor haz clic en el botón de abajo para verificar tu dirección de correo.",
      ),
    ).toHaveLength(1);
    expect(
      faults(
        "fr",
        "Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur:",
      ),
    ).toHaveLength(1);
    expect(
      faults("en", "If this wasn't you, please contact support immediately."),
    ).toHaveLength(1);
  });

  it.each(LOCALES)("%s: the verification mail has none of them", (locale) => {
    for (const name of ["Ada", ""]) {
      const mail = createEmailVerificationTemplate(
        "ada@example.com",
        name,
        LINK,
        locale,
      );
      const textPart = onOneLine(mail.text ?? "");
      const text = `${mail.subject} ${readable(mail.html)} ${textPart}`;

      expect(textPart.length).toBeGreaterThan(100);
      expect(text.length).toBeGreaterThan(300);
      expect(text).not.toContain("verify-email");
      expect(faults(locale, text)).toEqual([]);
    }
  });

  it("the search reads the text part: a colon before the link is found in French", () => {
    // What the text part of v2.5.2 was made of: the words of the button, a
    // colon and the link.
    expect(
      faults("fr", onOneLine(`Vérifier l'adresse email: ${LINK}`)),
    ).toHaveLength(1);
  });

  it("the security alert has none of the English ones", () => {
    const mail = createSecurityAlertTemplate(
      "ada@example.com",
      "Ada",
      "2fa_enabled",
      "Two-factor authentication has been enabled on your account",
    );
    const text = `${mail.subject} ${readable(mail.html)}`;

    expect(text).toContain("Security Alert");
    expect(faults("en", text)).toEqual([]);
  });
});
