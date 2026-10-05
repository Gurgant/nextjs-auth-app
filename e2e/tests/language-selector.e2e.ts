import fs from "fs";
import path from "path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { USERS, type TestUser, signInViaApi } from "../support/app";
import {
  createEmailVerificationToken,
  createTestUser,
  openTestDatabase,
} from "../support/db";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";
import italian from "../../messages/it.json";
import de from "../../messages/de.json";

/*
 * Changing the language keeps the page. The selector in the navigation bar
 * (src/components/language-selector.tsx) is on every page; choosing a
 * language there has to lead to the same address under the other locale,
 * query string and fragment included, and not to the home page.
 *
 * Each page under src/app/[locale] is named below once, by its route: either
 * with the way a test opens it, or with the reason why no browser ever shows
 * it. The first test compares those names with the page files, so a page that
 * is added later fails the suite until it is named here.
 *
 * Rate-limit budget for this file: successful sign-ins only. The verification
 * page is not limited. It is opened with a token that no row has, which
 * changes nothing, and once with the token of a user that the test creates
 * for itself (e2e/support/db.ts): the seeded users stay as other specs
 * expect them.
 */

// The files next-intl serves (src/i18n.ts), by locale.
const MESSAGES = { en, es, fr, it: italian, de };
type Locale = keyof typeof MESSAGES;
type Messages = (typeof MESSAGES)[Locale];

interface OpenedPage {
  /** Who opens it: a seeded user, or null for a visitor without a session. */
  as: TestUser | null;
  /** The address below the locale, a dynamic segment filled in ("" for home). */
  path: string;
  /** Has to arrive unchanged: an encoded character and two parameters. */
  query: string;
  from: Locale;
  to: Locale;
  /** What only this page shows, in the new language where it is translated. */
  shows: (page: Page, messages: Messages) => Locator;
}

/** The nav holds its own <h1> (Layout.appTitle), so page headings are scoped to <main>. */
const mainHeading = (page: Page, level: number, name: string) =>
  page.locator("main").getByRole("heading", { level, name, exact: true });

// A query that no page reads, and a fragment that no page has.
const QUERY = "?ref=a%2Fb&tab=2";
const FRAGMENT = "#part";
// The shape of a real token (32 letters and digits, src/lib/security.ts).
const UNKNOWN_TOKEN = "a1B2".repeat(8);

// Between them the tests of this file choose each of the five languages and
// leave from three of them.
const OPENED: Record<string, OpenedPage> = {
  "/": {
    as: null,
    path: "",
    query: QUERY,
    from: "en",
    to: "es",
    shows: (page, m) => mainHeading(page, 1, m.Home.title),
  },
  "/register": {
    as: null,
    path: "/register",
    query: QUERY,
    from: "en",
    to: "fr",
    shows: (page, m) => mainHeading(page, 1, m.Registration.title),
  },
  // The page reads `error` from the query: the title of that error shows
  // that the query arrived, not only that the address bar has it.
  "/auth/error": {
    as: null,
    path: "/auth/error",
    query: "?error=OAuthAccountNotLinked&ref=a%2Fb",
    from: "en",
    to: "de",
    shows: (page, m) =>
      page
        .locator("main")
        .getByText(m.Auth.error.accountAlreadyExists, { exact: true }),
  },
  "/verify-email/[token]": {
    as: null,
    path: `/verify-email/${UNKNOWN_TOKEN}`,
    query: QUERY,
    from: "de",
    to: "en",
    shows: (page, m) => mainHeading(page, 1, m.EmailVerification.failureTitle),
  },
  "/account": {
    as: USERS.user,
    path: "/account",
    query: QUERY,
    from: "en",
    to: "it",
    shows: (page, m) => mainHeading(page, 1, m.Account.title),
  },
  // The dashboards and the admin page are hardcoded English: their test ids
  // show which page it is, and <html lang> shows the locale.
  "/dashboard/user": {
    as: USERS.user,
    path: "/dashboard/user",
    query: QUERY,
    from: "es",
    to: "en",
    shows: (page) => page.getByTestId("user-dashboard"),
  },
  "/dashboard/pro": {
    as: USERS.pro,
    path: "/dashboard/pro",
    query: QUERY,
    from: "en",
    to: "es",
    shows: (page) => page.getByTestId("pro-dashboard"),
  },
  "/admin": {
    as: USERS.admin,
    path: "/admin",
    query: QUERY,
    from: "en",
    to: "fr",
    shows: (page) => page.getByTestId("admin-panel"),
  },
};

// Pages that a browser shows only on the way to another one.
const NOT_SHOWN: Record<string, string> = {
  "/dashboard":
    "the server answers it with a redirect to the dashboard of the role, or " +
    "to the sign-in page (role-access.e2e.ts)",
};

// Leaves by itself once it is hydrated; its test holds it open.
const SIGN_IN = "/auth/signin";

// The home and account pages render their content on the client.
const CLIENT_RENDER = { timeout: 20_000 };

const db = openTestDatabase();

test.afterAll(async () => {
  await db.$disconnect();
});

// A page file, with each extension that Next takes as one by default
// (next.config.ts sets no pageExtensions).
const PAGE_FILE = /^page\.(?:tsx?|jsx?)$/;

/** The routes of the page files under src/app/[locale]: "/" for its own page. */
function pagesUnderLocale(): string[] {
  const root = path.join(__dirname, "../../src/app/[locale]");
  const routes = (dir: string, route: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.isDirectory()) {
        return routes(path.join(dir, entry.name), `${route}/${entry.name}`);
      }
      return PAGE_FILE.test(entry.name) ? [route || "/"] : [];
    });
  return routes(root, "").sort();
}

/**
 * Opens `url` and waits until the layout is hydrated: the trigger of the
 * selector is server-rendered, but only React opens it. The sign of that is
 * the session request of the layout's session provider. Read in the source
 * of next-auth 5.0.0-beta.32 (react.js) and not measured: its SessionProvider
 * asks for the session in an effect when it gets no `session` prop, and
 * src/components/auth/session-provider.tsx, which wraps it, passes none.
 * Measured: every page this file opens sends the request, and without this
 * wait the tests fail at the closed selector (docs/TESTING.md).
 */
async function openHydrated(page: Page, url: string) {
  const sessionAsked = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/api/auth/session",
  );
  await page.goto(url);
  await sessionAsked;
}

/** Chooses `to` in the selector of a page that is shown in `from`. */
async function chooseLanguage(page: Page, from: Locale, to: Locale) {
  const nav = page.locator("nav");
  const trigger = nav.locator('button[aria-haspopup="listbox"]');
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await nav
    .getByRole("option")
    .filter({ hasText: MESSAGES[from].Languages[to].nativeName })
    .click();
}

test("every page under src/app/[locale] is named in this file", () => {
  expect(
    [...Object.keys(OPENED), ...Object.keys(NOT_SHOWN), SIGN_IN].sort(),
  ).toEqual(pagesUnderLocale());
});

for (const [route, opened] of Object.entries(OPENED)) {
  const { as, from, to, query } = opened;
  const who = as ? `a signed-in ${as.role}` : "a visitor";

  test(`${route}: ${who} who changes ${from} to ${to} stays on the page, query string and fragment included`, async ({
    page,
  }) => {
    if (as) await signInViaApi(page, as);

    await openHydrated(page, `/${from}${opened.path}${query}${FRAGMENT}`);
    await expect(opened.shows(page, MESSAGES[from])).toBeVisible(CLIENT_RENDER);

    await chooseLanguage(page, from, to);

    await expect(page).toHaveURL(`/${to}${opened.path}${query}${FRAGMENT}`);
    await expect(page.locator("html")).toHaveAttribute("lang", to);
    await expect(opened.shows(page, MESSAGES[to])).toBeVisible(CLIENT_RENDER);
  });
}

// The verification page uses the token up while it renders
// (src/app/[locale]/verify-email/[token]/page.tsx calls verifyEmailToken), and
// the selector asks for the same address again. So a visitor whose address
// was verified a moment ago reads, after choosing a language, that the
// verification failed because the token was already used, while the address
// stays verified. This test records what happens with a real token; it does
// not say that the page should answer a used token this way.
test("/verify-email/[token]: a visitor whose address the page has just verified and who changes en to fr stays on the address and reads that the token was already used", async ({
  page,
}) => {
  const user = await createTestUser(db, { verified: false });
  const token = await createEmailVerificationToken(db, user);
  const rest = `/verify-email/${token}${QUERY}${FRAGMENT}`;
  const inDatabase = async () => {
    const row = await db.emailVerificationToken.findUniqueOrThrow({
      where: { token },
      select: { used: true, user: { select: { emailVerified: true } } },
    });
    return { tokenUsed: row.used, verified: row.user.emailVerified !== null };
  };
  expect(await inDatabase()).toEqual({ tokenUsed: false, verified: false });

  await openHydrated(page, `/en${rest}`);
  await expect(
    mainHeading(page, 1, en.EmailVerification.successTitle),
  ).toBeVisible();
  expect(await inDatabase()).toEqual({ tokenUsed: true, verified: true });

  await chooseLanguage(page, "en", "fr");

  await expect(page).toHaveURL(`/fr${rest}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(
    mainHeading(page, 1, fr.EmailVerification.failureTitle),
  ).toBeVisible();
  await expect(
    page
      .locator("main")
      .getByText(fr.Errors.verificationTokenUsed, { exact: true }),
  ).toBeVisible();
  expect(await inDatabase()).toEqual({ tokenUsed: true, verified: true });
});

test(`${SIGN_IN}: a visitor who changes en to it while the page is still open stays on it, query string and fragment included`, async ({
  page,
}) => {
  // The page replaces itself with the home page once it is hydrated
  // (src/app/[locale]/auth/signin/page.tsx), so a click on the selector races
  // that. The requests the router sends in order to leave are held back
  // here, as a slow connection would hold them: the page stays open under
  // both locales for as long as the test looks at it.
  const rest = `?callbackUrl=%2Fen%2Faccount&ref=2${FRAGMENT}`;
  const heldBack: string[] = [];
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === "/en" || url.pathname === "/it",
    async (route) => {
      heldBack.push(new URL(route.request().url()).pathname);
      await released;
      await route.continue();
    },
  );
  const redirecting = (m: Messages) =>
    page
      .locator("main")
      .getByText(m.LoadingStates.redirecting, { exact: true });

  await openHydrated(page, `/en${SIGN_IN}${rest}`);
  await expect(redirecting(en)).toBeVisible();

  await chooseLanguage(page, "en", "it");

  await expect(page).toHaveURL(`/it${SIGN_IN}${rest}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  await expect(redirecting(italian)).toBeVisible();
  // The page was leaving under each locale, and what it asked for is held.
  await expect
    .poll(() => [...new Set(heldBack)].sort())
    .toEqual(["/en", "/it"]);
  await expect(page).toHaveURL(`/it${SIGN_IN}${rest}`);

  // Let go: the page leaves for the home page of the new locale.
  release();
  await expect(page).toHaveURL("/it");
});
