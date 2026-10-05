/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";
import ts from "typescript";

// Message-key guard. `pnpm validate-translations` compares the five message
// files with each other, not with the code: a text that nothing reads passes
// it, and so does a key that a file writes twice (JSON.parse keeps the last
// one). These checks read the sources instead:
//   A. every key of messages/en.json is read by an application file under
//      src (not by a test alone, and not by the test support of src/test);
//   B. no message file writes a key twice in one object.
// The other four files follow from A through the validator, which fails when
// their keys differ from those of en.json.
//
// A works on the syntax tree, not on types. It takes these forms for a read,
// and nothing else:
//   - t("key"), t.rich("key"), t.markup("key"), t.raw("key") and t.has("key"),
//     where the same file binds `t` to useTranslations("Namespace"),
//     getTranslations("Namespace") or
//     getTranslations({ namespace: "Namespace" });
//   - the key handed to a helper that fixes the namespace itself (KEY_HELPERS);
//   - a string that is the full path of a key ("validation.email.invalid"):
//     the Zod schemas carry their message keys this way.
// A key that the code reads in another way (a name built at run time, a
// translator handed to another function, a namespace in a variable) is
// reported as unread: it goes into ALLOWED_UNREAD with the place that reads
// it. A test or an E2E spec is no reader: the text is for a page.
// Dead keys that A does not see:
//   - a key whose full path is also a string somewhere else under src;
//   - a key named like one that the same file reads from another namespace
//     through the same name: a name is not followed to its scope, so one call
//     counts for every namespace the file binds that name to.

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const MESSAGES_DIRECTORY = path.join(REPO_ROOT, "messages");
const BASE_FILE = "en.json";

// Keys that may stay although A reports them, each with the place that reads
// it. The check compares for equality: an entry that no longer applies fails
// as well.
const ALLOWED_UNREAD: Record<string, string> = {};

const TRANSLATOR_FACTORIES = ["useTranslations", "getTranslations"];
const TRANSLATOR_METHODS = ["rich", "markup", "raw", "has"];

// The helpers of utils/server-translations.ts and utils/form-responses-i18n.ts
// take a key of one namespace. `prefix` is the legacy prefix that they drop
// from the key (see translateError).
const KEY_HELPERS = new Map<
  string,
  { namespace: string; argument: number; prefix: string }
>([
  ["translateError", { namespace: "Errors", argument: 1, prefix: "errors." }],
  [
    "createErrorResponseI18n",
    { namespace: "Errors", argument: 0, prefix: "errors." },
  ],
  [
    "createFieldErrorResponseI18n",
    { namespace: "Errors", argument: 0, prefix: "errors." },
  ],
  [
    "translateSuccess",
    { namespace: "Success", argument: 1, prefix: "success." },
  ],
  [
    "createSuccessResponseI18n",
    { namespace: "Success", argument: 0, prefix: "success." },
  ],
]);

interface Messages {
  [key: string]: string | Messages;
}

/** The full path of every text in a message file ("Namespace.key"). */
function leafKeys(messages: Messages, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === "string"
      ? [`${prefix}${key}`]
      : leafKeys(value, `${prefix}${key}.`),
  );
}

/**
 * The namespace of the translator that an expression creates: "" for one
 * without a namespace, whose keys are full paths. Nothing when the expression
 * creates no translator, or one whose namespace is not a string in place.
 */
function translatorNamespace(expression: ts.Expression): string | undefined {
  const call = ts.isAwaitExpression(expression)
    ? expression.expression
    : expression;
  if (
    !ts.isCallExpression(call) ||
    !ts.isIdentifier(call.expression) ||
    !TRANSLATOR_FACTORIES.includes(call.expression.text)
  ) {
    return undefined;
  }
  const [argument] = call.arguments;
  if (argument === undefined) return "";
  if (ts.isStringLiteralLike(argument)) return argument.text;
  if (!ts.isObjectLiteralExpression(argument)) return undefined;

  const namespace = argument.properties.find(
    (property) =>
      property.name !== undefined &&
      ts.isIdentifier(property.name) &&
      property.name.text === "namespace",
  );
  if (namespace === undefined) return "";
  return ts.isPropertyAssignment(namespace) &&
    ts.isStringLiteralLike(namespace.initializer)
    ? namespace.initializer.text
    : undefined;
}

/**
 * The paths that a source file reads, or may read: `unreadKeys` keeps the
 * ones that are keys. Every string of the file is among them, for the keys
 * that are written as a full path.
 */
function pathsReadBy(file: string, source: string): string[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
  const paths: string[] = [];

  // The names that the file binds to a translator, each with its namespaces.
  const translators = new Map<string, string[]>();
  const bind = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined
    ) {
      const namespace = translatorNamespace(node.initializer);
      if (namespace !== undefined) {
        translators.set(node.name.text, [
          ...(translators.get(node.name.text) ?? []),
          namespace,
        ]);
      }
    }
    ts.forEachChild(node, bind);
  };
  bind(parsed);

  const read = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node)) paths.push(node.text);
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      // t("key") and t.rich("key")
      const translator = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee) &&
            ts.isIdentifier(callee.expression) &&
            TRANSLATOR_METHODS.includes(callee.name.text)
          ? callee.expression.text
          : undefined;
      const [key] = node.arguments;
      if (
        translator !== undefined &&
        key !== undefined &&
        ts.isStringLiteralLike(key)
      ) {
        for (const namespace of translators.get(translator) ?? []) {
          paths.push(namespace === "" ? key.text : `${namespace}.${key.text}`);
        }
      }
      // createErrorResponseI18n("errors.key", ...)
      const helper = ts.isIdentifier(callee)
        ? KEY_HELPERS.get(callee.text)
        : undefined;
      const helperKey = helper && node.arguments[helper.argument];
      if (helper && helperKey && ts.isStringLiteralLike(helperKey)) {
        const text = helperKey.text.startsWith(helper.prefix)
          ? helperKey.text.slice(helper.prefix.length)
          : helperKey.text;
        paths.push(`${helper.namespace}.${text}`);
      }
    }
    ts.forEachChild(node, read);
  };
  read(parsed);

  return paths;
}

/** The keys that at least one of the sources reads. */
function keysRead(messages: Messages, sources: Map<string, string>): string[] {
  const read = new Set(
    [...sources].flatMap(([file, source]) => pathsReadBy(file, source)),
  );
  return leafKeys(messages).filter((key) => read.has(key));
}

/** The keys that none of the sources reads. */
function unreadKeys(
  messages: Messages,
  sources: Map<string, string>,
): string[] {
  const read = new Set(keysRead(messages, sources));
  return leafKeys(messages)
    .filter((key) => !read.has(key))
    .sort();
}

/**
 * The keys that a JSON text writes more than once in one object, by full
 * path. The TypeScript parser keeps every property; JSON.parse keeps the last
 * one only.
 */
function duplicateKeys(file: string, text: string): string[] {
  const parsed = ts.parseJsonText(file, text);
  const duplicates: string[] = [];
  const visit = (node: ts.Node, prefix: string): void => {
    if (!ts.isObjectLiteralExpression(node)) {
      ts.forEachChild(node, (child) => visit(child, prefix));
      return;
    }
    const written = new Set<string>();
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = ts.isStringLiteralLike(property.name)
        ? property.name.text
        : property.name.getText(parsed);
      if (written.has(name)) duplicates.push(`${prefix}${name}`);
      written.add(name);
      visit(property.initializer, `${prefix}${name}.`);
    }
  };
  visit(parsed, "");
  return duplicates;
}

const SOURCE_FILE = /\.(?:ts|tsx|js|jsx)$/;
// The generated Prisma client is not code of this repository, and src/test
// holds test support only.
const SKIPPED_DIRECTORIES = ["src/generated", "src/test"];

const isTest = (file: string) =>
  file.includes("/__tests__/") || /\.test\.tsx?$/.test(file);

/** The application's source files under `dir` (repo-relative), without its tests. */
function applicationFiles(dir: string): string[] {
  return fs
    .readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })
    .flatMap((entry) => {
      const file = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) {
        return SKIPPED_DIRECTORIES.includes(file) ? [] : applicationFiles(file);
      }
      return SOURCE_FILE.test(entry.name) && !isTest(file) ? [file] : [];
    });
}

function readMessages(file: string): Messages {
  return JSON.parse(
    fs.readFileSync(path.join(MESSAGES_DIRECTORY, file), "utf8"),
  );
}

// A check that finds nothing in sources it cannot read would pass. These
// sources have a known answer.
describe("the checks, on sources with a known answer", () => {
  const messages: Messages = {
    Page: {
      title: "read through useTranslations",
      rich: "read through t.rich",
      present: "read through t.has",
      nested: { read: "read by its path in the namespace", unread: "-" },
      commented: "named in a comment only",
      builtAtRunTime: "read through a template",
    },
    Mail: {
      subject: "read through getTranslations with a namespace option",
      title: "the same name as Page.title, in a file that does not read it",
    },
    Root: { full: "read by its full path through a translator" },
    Errors: {
      known: "read through a helper",
      legacy: "read through a helper, with the legacy prefix",
      field: "read through the field helper",
      unread: "-",
    },
    Success: { saved: "read through a helper", unread: "-" },
    validation: { email: { invalid: "written as a full path", unread: "-" } },
    Variable: { key: "read through a namespace in a variable" },
  };
  const sources = new Map(
    Object.entries({
      "src/app/page.tsx": [
        'const t = useTranslations("Page");',
        "const tRoot = useTranslations();",
        't("title"); t.rich("rich"); t.has("present"); t("nested.read");',
        'tRoot("Root.full");',
        '// t("commented") is named in this comment and read nowhere',
        "t(`built${suffix}`);",
        // A call of another function is no read, whatever it is handed.
        'notATranslator("nested.unread");',
      ].join("\n"),
      "src/lib/mail.ts": [
        'const t = await getTranslations({ locale, namespace: "Mail" });',
        't("subject");',
        "const namespace = 'Variable';",
        "const tVariable = await getTranslations({ locale, namespace });",
        'tVariable("key");',
      ].join("\n"),
      "src/lib/actions.ts": [
        'createErrorResponseI18n("known", locale);',
        'translateError(locale, "errors.legacy");',
        'createFieldErrorResponseI18n("errors.field", "email", locale);',
        'createSuccessResponseI18n("success.saved", locale);',
        'const schema = z.string().email({ message: "validation.email.invalid" });',
      ].join("\n"),
    }),
  );

  it("reports the keys that no source reads", () => {
    expect(unreadKeys(messages, sources)).toEqual([
      "Errors.unread",
      "Mail.title",
      "Page.builtAtRunTime",
      "Page.commented",
      "Page.nested.unread",
      "Success.unread",
      "Variable.key",
      "validation.email.unread",
    ]);
  });

  it("reports a key that a text writes twice in one object", () => {
    expect(
      duplicateKeys(
        "fixture.json",
        [
          "{",
          '  "Page": { "title": "a", "body": "b", "title": "c" },',
          '  "Mail": { "title": "a", "nested": { "x": "1", "x": "2" } },',
          '  "Page": {}',
          "}",
        ].join("\n"),
      ),
    ).toEqual(["Page.title", "Mail.nested.x", "Page"]);
    expect(
      duplicateKeys(
        "fixture.json",
        '{ "Page": { "a": "1" }, "Mail": { "a": "1" } }',
      ),
    ).toEqual([]);
  });
});

describe("message keys in this repository", () => {
  const files = fs
    .readdirSync(MESSAGES_DIRECTORY)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const base = readMessages(BASE_FILE);
  const sources = new Map(
    applicationFiles("src").map((file): [string, string] => [
      file,
      fs.readFileSync(path.join(REPO_ROOT, file), "utf8"),
    ]),
  );

  it("reads the message files and the sources", () => {
    expect(files).toEqual([
      "de.json",
      "en.json",
      "es.json",
      "fr.json",
      "it.json",
    ]);
    expect(leafKeys(base).length).toBeGreaterThan(100);
    expect(sources.size).toBeGreaterThan(100);
    expect([...sources.keys()]).toEqual(
      expect.arrayContaining([
        "src/app/[locale]/page.tsx",
        "src/lib/actions/auth.ts",
        "src/lib/validation/schemas.ts",
      ]),
    );
    expect([...sources.keys()].filter(isTest)).toEqual([]);
    // One key for each form of a read.
    expect(keysRead(base, sources)).toEqual(
      expect.arrayContaining([
        "Home.title", // useTranslations("Home")
        "EmailVerification.metaTitle", // getTranslations({ namespace })
        "Errors.unauthorized", // a helper, with the legacy prefix
        "validation.email.invalid", // a full path
      ]),
    );
  });

  it("every allowed entry gives its reason", () => {
    expect(
      Object.entries(ALLOWED_UNREAD)
        .filter(([, reason]) => reason.trim() === "")
        .map(([key]) => key),
    ).toEqual([]);
  });

  describe("A. no unread keys", () => {
    it(`every key of messages/${BASE_FILE} is read by an application file under src`, () => {
      expect(unreadKeys(base, sources)).toEqual(
        Object.keys(ALLOWED_UNREAD).sort(),
      );
    });
  });

  describe("B. no key written twice", () => {
    it.each(files)("messages/%s", (file) => {
      const text = fs.readFileSync(path.join(MESSAGES_DIRECTORY, file), "utf8");

      expect(duplicateKeys(file, text)).toEqual([]);
    });
  });
});
