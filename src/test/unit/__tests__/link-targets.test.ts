/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";
import ts from "typescript";

// Link-target guard. A link to a page that does not exist compiles, renders
// and passes every behavioural test: it is the visitor who gets the 404. This
// check reads the sources instead:
//   every internal link target that a file under src/app or src/components
//   writes as a literal is served by a page or a route handler under src/app.
// The routes are derived from the files on disk (page.* and route.*), the way
// Next.js derives them: a `[name]` segment takes any one value, `[...name]`
// one or more segments, `[[...name]]` any number, and a `(group)` folder is
// no segment. One dynamic segment is known better: `[locale]` takes the
// locales that have a message file, and nothing else.
//
// A target is read in these positions, and nowhere else:
//   - a JSX attribute or an object property named `href`, `callbackUrl` or
//     `redirectTo` (<a>, <Link>, the options of signIn() and signOut());
//   - the first argument of push(), replace() and prefetch() on a name that
//     the same file binds to useRouter();
//   - the first argument of redirect() and permanentRedirect().
// It is a literal when it is a string or a template whose text starts with
// one "/". Each `${...}` of a template stands for a value that the check does
// not know: it is served by a dynamic segment only, never by a fixed one.
// Both sides of `a ? b : c`, `a || b` and `a ?? b` are read, the right side
// of `a && b`, and the two sides of `a + b` joined, where a side that the
// file does not write counts as one `${...}`. A name is replaced by what the
// same file gives a variable of that name.
// Dead links that the check does not see:
//   - a target built at run time: the result of a call
//     (routes.dashboard(locale)), a parameter, a template that starts with
//     `${...}`, a sum that starts with a value the file does not write;
//   - a `${...}` that is not one whole segment: two in one segment
//     (`/${locale}${rest}`) or one that holds a "/" are read as one value of
//     one segment, which a dynamic segment serves;
//   - a target in another position: `window.location.href = ...`,
//     NextResponse.redirect(new URL(...)), a property with another name;
//   - a target in a file outside src/app and src/components: the `pages` of
//     the Auth.js configuration, the link of an e-mail, a helper of src/lib;
//   - a value that a dynamic segment other than [locale] does not accept;
//   - a route handler that does not answer GET: a route.* file serves its
//     path here whatever methods it exports, and a link asks with GET;
//   - a page that exists and answers with notFound() or with a redirect;
//   - the query string and the fragment: both are cut off.
// It reports a live link when something else than a page serves it: the
// middleware redirects a path without a locale to one with it, and the
// check takes "/account" for a dead link. Write the locale.
// The folder conventions that the check does not read (a private `_folder`,
// a parallel `@slot`, an intercepting `(.)folder`) fail a test of their own
// when a page or a route handler appears under one.

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const APP_DIRECTORY = "src/app";
const LINK_DIRECTORIES = ["src/app", "src/components"];

// Dead links that may stay although the check reports them, each with the
// reason, as "file target" (for example
// "src/app/[locale]/page.tsx /${...}/pricing"). The check compares for
// equality: an entry that no longer applies fails as well.
// "pending owner decision": nothing is decided yet, and the entry says what
// is open.
// The list is empty: the repository has no dead link that the check reports.
const ALLOWED_DEAD_LINKS: Record<string, string> = {};

const LINK_PROPERTIES = ["href", "callbackUrl", "redirectTo"];
const ROUTER_METHODS = ["push", "replace", "prefetch"];
const REDIRECT_FUNCTIONS = ["redirect", "permanentRedirect"];

// Stands for one `${...}` in the text of a target.
const UNKNOWN = "\u0000";

const ROUTE_FILE = /^(?:page|route)\.(?:tsx|ts|jsx|js)$/;
const UNREAD_CONVENTION = /^(?:_|@|\(\.)/;
const isGroup = (segment: string) => /^\([^.)][^)]*\)$/.test(segment);

/**
 * The routes that a list of files under src/app serves, as paths
 * ("/[locale]/account", "/api/health"). A file that is no page and no route
 * handler serves nothing.
 */
function routesOf(files: string[]): string[] {
  return files
    .filter((file) => file.startsWith(`${APP_DIRECTORY}/`))
    .filter((file) => ROUTE_FILE.test(path.posix.basename(file)))
    .map((file) => {
      const segments = path.posix
        .dirname(file)
        .split("/")
        .slice(APP_DIRECTORY.split("/").length)
        .filter((segment) => !isGroup(segment));
      return `/${segments.join("/")}`;
    })
    .sort();
}

/** The segments of a path, without the empty ones of "/" and of a trailing slash. */
const segmentsOf = (pathname: string) =>
  pathname.split("/").filter((segment) => segment !== "");

/**
 * Whether `route` serves `target`, a path that may hold UNKNOWN values.
 * `locales` are the values that a [locale] segment takes.
 */
function serves(route: string, target: string, locales: string[]): boolean {
  const asked = segmentsOf(target.split(/[?#]/)[0]);
  const segments = segmentsOf(route);

  for (const [index, segment] of segments.entries()) {
    if (/^\[\[\.\.\.\w+\]\]$/.test(segment)) return true;
    if (/^\[\.\.\.\w+\]$/.test(segment)) return asked.length > index;
    if (index >= asked.length) return false;
    const value = asked[index];
    if (segment === "[locale]") {
      if (!value.includes(UNKNOWN) && !locales.includes(value)) return false;
    } else if (!/^\[\w+\]$/.test(segment) && segment !== value) {
      return false;
    }
  }
  return asked.length === segments.length;
}

/** The text that a failure shows for a target. */
const shown = (target: string) => target.split(UNKNOWN).join("${...}");

/**
 * The internal targets that a source file writes as a literal in a link
 * position, each with UNKNOWN for a `${...}`.
 */
function linkTargetsOf(file: string, source: string): string[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
  const targets: string[] = [];

  // What the file's variables are given, and the names it binds to a router.
  // A name is not followed to its scope: every declaration of it counts.
  const initializers = new Map<string, ts.Expression[]>();
  const routers = new Set<string>();
  const bind = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined
    ) {
      const { initializer } = node;
      initializers.set(node.name.text, [
        ...(initializers.get(node.name.text) ?? []),
        initializer,
      ]);
      if (
        ts.isCallExpression(initializer) &&
        ts.isIdentifier(initializer.expression) &&
        initializer.expression.text === "useRouter"
      ) {
        routers.add(node.name.text);
      }
    }
    ts.forEachChild(node, bind);
  };
  bind(parsed);

  /** The texts that an expression can have, as far as the file writes them. */
  const textsOf = (expression: ts.Expression, followed: string[]): string[] => {
    if (
      ts.isParenthesizedExpression(expression) ||
      ts.isAsExpression(expression) ||
      ts.isSatisfiesExpression(expression) ||
      ts.isNonNullExpression(expression)
    ) {
      return textsOf(expression.expression, followed);
    }
    if (ts.isConditionalExpression(expression)) {
      return [
        ...textsOf(expression.whenTrue, followed),
        ...textsOf(expression.whenFalse, followed),
      ];
    }
    if (ts.isBinaryExpression(expression)) {
      const operator = expression.operatorToken.kind;
      const left = textsOf(expression.left, followed);
      const right = textsOf(expression.right, followed);
      if (
        operator === ts.SyntaxKind.BarBarToken ||
        operator === ts.SyntaxKind.QuestionQuestionToken
      ) {
        return [...left, ...right];
      }
      // `a && b` is `b` whenever it is a target at all.
      if (operator === ts.SyntaxKind.AmpersandAmpersandToken) return right;
      // `a + b`: a side that the file does not write is one unknown value.
      if (operator === ts.SyntaxKind.PlusToken) {
        const heads = left.length > 0 ? left : [UNKNOWN];
        const tails = right.length > 0 ? right : [UNKNOWN];
        return heads.flatMap((head) => tails.map((tail) => head + tail));
      }
      return [];
    }
    if (ts.isStringLiteralLike(expression)) return [expression.text];
    if (ts.isTemplateExpression(expression)) {
      return [
        expression.head.text +
          expression.templateSpans
            .map((span) => UNKNOWN + span.literal.text)
            .join(""),
      ];
    }
    if (ts.isIdentifier(expression) && !followed.includes(expression.text)) {
      return (initializers.get(expression.text) ?? []).flatMap((initializer) =>
        textsOf(initializer, [...followed, expression.text]),
      );
    }
    return [];
  };

  const read = (expression: ts.Expression | undefined): void => {
    if (expression === undefined) return;
    targets.push(
      ...textsOf(expression, []).filter(
        (text) => text.startsWith("/") && !text.startsWith("//"),
      ),
    );
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isJsxAttribute(node) &&
      LINK_PROPERTIES.includes(node.name.getText(parsed))
    ) {
      const value = node.initializer;
      read(
        value !== undefined && ts.isJsxExpression(value)
          ? value.expression
          : value,
      );
    }
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) &&
      LINK_PROPERTIES.includes(node.name.text)
    ) {
      read(node.initializer);
    }
    if (
      ts.isShorthandPropertyAssignment(node) &&
      LINK_PROPERTIES.includes(node.name.text)
    ) {
      read(node.name);
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const navigates =
        (ts.isIdentifier(callee) && REDIRECT_FUNCTIONS.includes(callee.text)) ||
        (ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.expression) &&
          routers.has(callee.expression.text) &&
          ROUTER_METHODS.includes(callee.name.text));
      if (navigates) read(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);

  return targets;
}

/** "file target" for every link target that no route serves. */
function deadLinks(
  sources: Map<string, string>,
  routes: string[],
  locales: string[],
): string[] {
  const dead = [...sources].flatMap(([file, source]) =>
    linkTargetsOf(file, source)
      .filter(
        (target) => !routes.some((route) => serves(route, target, locales)),
      )
      .map((target) => `${file} ${shown(target)}`),
  );
  return [...new Set(dead)].sort();
}

const SOURCE_FILE = /\.(?:ts|tsx|js|jsx)$/;

const isTest = (file: string) =>
  file.includes("/__tests__/") || /\.test\.tsx?$/.test(file);

/** Every file under `dir` (repo-relative, "/" as separator). */
function filesUnder(dir: string): string[] {
  return fs
    .readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })
    .flatMap((entry) => {
      const file = path.posix.join(dir, entry.name);
      return entry.isDirectory() ? filesUnder(file) : [file];
    });
}

// A check that finds nothing in sources it cannot read would pass. These
// sources have a known answer.
describe("the check, on sources with a known answer", () => {
  const routes = routesOf([
    "src/app/[locale]/page.tsx",
    "src/app/[locale]/layout.tsx",
    "src/app/[locale]/account/page.tsx",
    "src/app/[locale]/account/helper.tsx",
    "src/app/[locale]/(marketing)/pricing/page.tsx",
    "src/app/[locale]/verify-email/[token]/page.tsx",
    "src/app/[locale]/docs/[[...slug]]/page.tsx",
    "src/app/api/health/route.ts",
    "src/app/api/auth/[...nextauth]/route.ts",
    "src/components/page.tsx",
  ]);
  const sources = new Map(
    Object.entries({
      "src/app/[locale]/page.tsx": [
        "const router = useRouter();",
        "const items: string[] = [];",
        "const home = `/${locale}`;",
        "const settings = `/${locale}/settings`;",
        "export default function Page({ locale, token, to }) {",
        '  router.push("/en/account");',
        "  router.replace(`/${locale}/billing?plan=pro`);",
        // Not a router: an array of the same file.
        '  items.push("/en/nowhere");',
        "  if (!token) redirect(`/${locale}/login` as Route);",
        "  signIn('google', { callbackUrl: `/${locale}/account?linked=1#top` });",
        "  signOut({ callbackUrl: to || home });",
        "  permanentRedirect(to ?? settings);",
        "  return (",
        "    <nav>",
        '      <a href="/api/health">live</a>',
        '      <a href="/api/auth/session">live, by the catch-all</a>',
        '      <a href="/api/auth">dead: a catch-all needs a segment</a>',
        '      <a href="/api/metrics">dead</a>',
        "      <Link href={`/${locale}/pricing`}>live, in a route group</Link>",
        "      <Link href={`/${locale}/account/helper`}>dead: no page</Link>",
        "      <Link href={`/${locale}/verify-email/${token}`}>live</Link>",
        "      <Link href={`/${locale}/docs`}>live, optional catch-all</Link>",
        "      <Link href={`/${locale}/docs/a/b`}>live</Link>",
        "      <Link href={`/${section}/health`}>dead: api is fixed</Link>",
        "      <Link href={admin ? `/${locale}/admin` : `/${locale}`}>one dead</Link>",
        "      <Link href={'/' + locale + '/account'}>live, joined with +</Link>",
        "      <Link href={'/' + locale + '/invoices'}>dead, joined with +</Link>",
        "      <Link href={home + '/account'}>live: home is written above</Link>",
        "      <Link href={home + '/archive'}>dead: home is written above</Link>",
        "      <Link href={to + '/missing'}>built at run time</Link>",
        "      <Link href={token && `/${locale}/account`}>live, behind &&</Link>",
        "      <Link href={token && `/${locale}/exports`}>dead, behind &&</Link>",
        '      <Link href="/en/account/">live, trailing slash</Link>',
        '      <Link href="/account">dead: no locale</Link>',
        '      <Link href="/xx/account">dead: no such locale</Link>',
        '      <Link href="/fr/verify-email/xx">live: any token</Link>',
        '      <a href="https://example.com/missing">not internal</a>',
        '      <a href="//example.com/missing">not internal</a>',
        '      <a href="#section">not internal</a>',
        "      <Link href={`${base}/missing`}>built at run time</Link>",
        "      <Link href={pathFor(locale)}>built at run time</Link>",
        '      <Thing title="/en/not-a-link" />',
        '      {/* <a href="/en/commented-out">not code</a> */}',
        "    </nav>",
        "  );",
        "}",
      ].join("\n"),
      "src/components/menu.tsx": [
        "const items = [{ href: `/${locale}/account` }, { href: '/en/reports' }];",
        "const redirectTo = `/${locale}/welcome`;",
        "export const guard = { redirectTo };",
      ].join("\n"),
    }),
  );

  it("derives the routes from the page and route files", () => {
    expect(routes).toEqual([
      "/[locale]",
      "/[locale]/account",
      "/[locale]/docs/[[...slug]]",
      "/[locale]/pricing",
      "/[locale]/verify-email/[token]",
      "/api/auth/[...nextauth]",
      "/api/health",
    ]);
  });

  it("reports the link targets that no route serves", () => {
    expect(deadLinks(sources, routes, ["en", "fr"])).toEqual([
      "src/app/[locale]/page.tsx /${...}/account/helper",
      "src/app/[locale]/page.tsx /${...}/admin",
      "src/app/[locale]/page.tsx /${...}/archive",
      "src/app/[locale]/page.tsx /${...}/billing?plan=pro",
      "src/app/[locale]/page.tsx /${...}/exports",
      "src/app/[locale]/page.tsx /${...}/health",
      "src/app/[locale]/page.tsx /${...}/invoices",
      "src/app/[locale]/page.tsx /${...}/login",
      "src/app/[locale]/page.tsx /${...}/settings",
      "src/app/[locale]/page.tsx /account",
      "src/app/[locale]/page.tsx /api/auth",
      "src/app/[locale]/page.tsx /api/metrics",
      "src/app/[locale]/page.tsx /xx/account",
      "src/components/menu.tsx /${...}/welcome",
      "src/components/menu.tsx /en/reports",
    ]);
  });
});

describe("link targets in this repository", () => {
  const appFiles = filesUnder(APP_DIRECTORY);
  const routes = routesOf(appFiles);
  const locales = fs
    .readdirSync(path.join(REPO_ROOT, "messages"))
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.basename(file, ".json"))
    .sort();
  const sources = new Map(
    LINK_DIRECTORIES.flatMap(filesUnder)
      .filter((file) => SOURCE_FILE.test(file) && !isTest(file))
      .map((file): [string, string] => [
        file,
        fs.readFileSync(path.join(REPO_ROOT, file), "utf8"),
      ]),
  );

  it("reads the routes, the locales and the sources", () => {
    expect(locales).toEqual(["de", "en", "es", "fr", "it"]);
    expect(routes).toEqual(
      expect.arrayContaining([
        "/[locale]",
        "/[locale]/account",
        "/[locale]/verify-email/[token]",
        "/api/auth/[...nextauth]",
        "/api/health",
      ]),
    );
    expect(sources.size).toBeGreaterThan(30);
    // One live target for each position that the check reads.
    const targets = [...sources].flatMap(([file, source]) =>
      linkTargetsOf(file, source).map((target) => `${file} ${shown(target)}`),
    );
    expect(targets).toEqual(
      expect.arrayContaining([
        "src/app/[locale]/layout.tsx /${...}", // href
        "src/app/[locale]/admin/page.tsx /api/admin/metrics", // href, a route handler
        "src/components/auth/credentials-form.tsx /${...}/account", // router.push()
        "src/app/[locale]/dashboard/page.tsx /${...}/dashboard/pro", // redirect()
        "src/components/auth/sign-in-button.tsx /${...}/account", // callbackUrl
        "src/components/layouts/auth-guard.tsx /${...}", // a name, by its const
      ]),
    );
  });

  it("finds no page or route handler under a folder convention that the check does not read", () => {
    const unread = appFiles.filter(
      (file) =>
        ROUTE_FILE.test(path.posix.basename(file)) &&
        file.split("/").some((segment) => UNREAD_CONVENTION.test(segment)),
    );

    expect(unread).toEqual([]);
  });

  it("every allowed entry gives its reason", () => {
    expect(
      Object.entries(ALLOWED_DEAD_LINKS)
        .filter(([, reason]) => reason.trim() === "")
        .map(([link]) => link),
    ).toEqual([]);
  });

  it("every internal link target is served by a page or a route handler", () => {
    expect(deadLinks(sources, routes, locales)).toEqual(
      Object.keys(ALLOWED_DEAD_LINKS).sort(),
    );
  });
});
