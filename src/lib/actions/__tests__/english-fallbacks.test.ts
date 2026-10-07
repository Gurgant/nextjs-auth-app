/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";
import ts from "typescript";
import enMessages from "../../../../messages/en.json";

// The server actions hand the translation helpers a key and an English text
// for the case that the key cannot be translated:
//   createErrorResponseI18n("errors.onlyGoogleUsers", locale, "Only ...").
// The text is a second copy of the message of messages/en.json. When a
// message is corrected, its copy has to follow, or the mistake is still what
// a reader gets whenever the fallback is used. These checks read the two
// action files and compare the copies of the messages named below.
//
// Other fallbacks say something else than their message on purpose ("You
// must be signed in." for Errors.unauthorized): they are not compared.

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const ACTION_FILES = [
  "src/lib/actions/advanced-auth.ts",
  "src/lib/actions/auth.ts",
];

// The helpers of utils/server-translations.ts and utils/form-responses-i18n.ts
// that take an English fallback: the place of the key and of the fallback
// among the arguments, and the legacy prefix that the helper drops.
const HELPERS: Record<
  string,
  { namespace: "Errors" | "Success"; key: number; fallback: number }
> = {
  translateError: { namespace: "Errors", key: 1, fallback: 2 },
  createErrorResponseI18n: { namespace: "Errors", key: 0, fallback: 2 },
  createFieldErrorResponseI18n: { namespace: "Errors", key: 0, fallback: 3 },
  translateSuccess: { namespace: "Success", key: 1, fallback: 2 },
  createSuccessResponseI18n: { namespace: "Success", key: 0, fallback: 2 },
};

// Messages whose English text was corrected after v2.5.2 and that the code
// repeats ("setup" as a verb, "Google authenticated" without its hyphen).
const CORRECTED = ["Errors.failedToSetupTwoFactor", "Errors.onlyGoogleUsers"];

interface Fallback {
  key: string;
  text: string;
}

/** The key and the English fallback of every helper call in a source text. */
function fallbacksIn(file: string, source: string): Fallback[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
  const found: Fallback[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const helper = HELPERS[node.expression.text];
      const key = helper && node.arguments[helper.key];
      const fallback = helper && node.arguments[helper.fallback];
      if (
        helper &&
        key &&
        fallback &&
        ts.isStringLiteralLike(key) &&
        ts.isStringLiteralLike(fallback)
      ) {
        found.push({
          key: `${helper.namespace}.${key.text.replace(/^(?:errors|success)\./, "")}`,
          text: fallback.text,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

const messageOf = (key: string): string | undefined => {
  const [namespace, name] = key.split(".");
  return (enMessages as Record<string, Record<string, unknown>>)[namespace]?.[
    name
  ] as string | undefined;
};

describe("the search, on a source with a known answer", () => {
  it("reads the key and the fallback of each helper", () => {
    const source = [
      'await createErrorResponseI18n("errors.known", locale, "Known text");',
      'await createFieldErrorResponseI18n("errors.field", "email", locale, "Field text");',
      'await translateSuccess(locale, "success.saved", "Saved");',
      // No fallback, and a call of another function.
      'await createErrorResponseI18n("errors.bare", locale);',
      'await somethingElse("errors.other", locale, "Other");',
    ].join("\n");

    expect(fallbacksIn("fixture.ts", source)).toEqual([
      { key: "Errors.known", text: "Known text" },
      { key: "Errors.field", text: "Field text" },
      { key: "Success.saved", text: "Saved" },
    ]);
  });
});

describe("the English fallbacks of the server actions", () => {
  const fallbacks = ACTION_FILES.flatMap((file) =>
    fallbacksIn(file, fs.readFileSync(path.join(REPO_ROOT, file), "utf8")),
  );

  it("are read from the two files", () => {
    expect(fallbacks.length).toBeGreaterThan(40);
    // Most are the message itself: the comparison below is not empty-handed.
    expect(
      fallbacks.filter(({ key, text }) => messageOf(key) === text).length,
    ).toBeGreaterThan(30);
  });

  it.each(CORRECTED)(
    "the fallback of %s is the message of messages/en.json",
    (key) => {
      const copies = fallbacks.filter((fallback) => fallback.key === key);

      expect(copies.length).toBeGreaterThan(0);
      expect(messageOf(key)).toEqual(expect.any(String));
      expect(copies.map(({ text }) => text)).toEqual(
        copies.map(() => messageOf(key)),
      );
    },
  );

  it("none repeats the two mistakes that were corrected", () => {
    const mistaken = fallbacks.filter(({ text }) =>
      /\bto setup\b|Google authenticated/.test(text),
    );

    expect(mistaken).toEqual([]);
    // The same search finds them in the texts of v2.5.2.
    expect("Failed to setup two-factor authentication").toMatch(/\bto setup\b/);
    expect("Only Google authenticated users can add passwords").toMatch(
      /Google authenticated/,
    );
  });
});
