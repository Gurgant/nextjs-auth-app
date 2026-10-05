import { test, expect, type Page } from "@playwright/test";
import { apiPost, signInViaApi } from "../support/app";
import { createTestUser, openTestDatabase } from "../support/db";
import italian from "../../messages/it.json";

/*
 * Linking Google, up to the point where Google takes over (the suite never
 * clicks the Google button). The account page first sends the password to
 * POST /api/auth/link-account/initiate and reads `success` / `code` from the
 * answer (src/components/account/oauth-account-linking.tsx); then it starts
 * the Google sign-in. When Google returns, the server links the account only
 * if that password step left a grant on the user's row
 * (src/lib/auth/link-gate.ts), and otherwise sends the browser to the
 * refusal page.
 *
 * What this file measures: the real route writes the grant into the real
 * database and links nothing, and the refusal page is a real page with
 * translated text that the address without a locale reaches. It does NOT
 * measure that a refused Google callback arrives there: no test completes a
 * Google sign-in. The decision itself is measured on real PostgreSQL by the
 * integration test (docs/TESTING.md).
 *
 * The route used to create a link request and return its token, and a page
 * under /{locale}/link-account/confirm/{token} completed that request without
 * a session. Both are gone: the route hands out no token, and the page's URL
 * answers 404.
 *
 * Rate-limit budget for this file: 0 registrations, 0 failed sign-ins, 0 2FA
 * codes, 0 wrong link passwords. The users are created in the database
 * (e2e/support/db.ts), so the seeded users stay as other specs expect them.
 */

// LINK_GRANT_TTL_SECONDS in src/lib/auth/link-grant.ts (not imported: the
// module opens the app's database client).
const GRANT_LIFETIME_MS = 300_000;

// What the server redirects a refused link to (LINK_REFUSED_PATH in
// src/lib/auth/link-refusal.ts): no locale, the middleware adds it.
const REFUSED_ADDRESS = "/auth/error?error=LinkNotConfirmed";

const db = openTestDatabase();

test.afterAll(async () => {
  await db.$disconnect();
});

/**
 * Opens `url` and waits until the page is hydrated: the buttons of the error
 * page are server-rendered, but only React makes them work. The sign of that
 * is the session request of the layout's session provider, for the reason
 * given in language-selector.e2e.ts.
 */
async function openHydrated(page: Page, url: string) {
  const sessionAsked = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/api/auth/session",
  );
  await page.goto(url);
  await sessionAsked;
}

const refusalText = (page: Page, text: string) =>
  page.locator("main").getByText(text, { exact: true });

test("the password check before linking Google records a grant and one event, links nothing and answers without a token", async ({
  page,
}) => {
  const user = await createTestUser(db);
  await signInViaApi(page, user);

  const before = Date.now();
  const res = await apiPost(page, "/api/auth/link-account/initiate", {
    data: { password: user.password, provider: "google" },
  });
  const after = Date.now();

  const events = await db.securityEvent.findMany({
    where: { userId: user.id },
  });

  // One comparison, so that a failure shows the answer and the event together.
  expect({
    status: res.status(),
    answer: await res.json(),
    events: events.map(({ eventType, success, metadata }) => ({
      eventType,
      success,
      metadata,
    })),
  }).toStrictEqual({
    status: 200,
    answer: { success: true, provider: "google" },
    events: [
      {
        eventType: "account_link_initiated",
        success: true,
        metadata: { provider: "google" },
      },
    ],
  });

  // The grant and the event are the route's only traces: nothing is linked.
  const row = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { accounts: true },
  });
  expect(row.linkGrantProvider).toBe("google");
  // The server stamps the grant between the two readings of this clock (the
  // dev server runs on the same machine); one second of slack below.
  const expiresAt = row.linkGrantExpiresAt?.getTime() ?? 0;
  expect(expiresAt).toBeGreaterThan(before + GRANT_LIFETIME_MS - 1000);
  expect(expiresAt).toBeLessThanOrEqual(after + GRANT_LIFETIME_MS);
  expect(row.hasGoogleAccount).toBe(false);
  expect(row.accounts.map((account) => account.provider)).toEqual([
    "credentials",
  ]);
});

test("the address a refused link is sent to shows the refusal in the language of the NEXT_LOCALE cookie and leads to the account page", async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error("The Playwright config sets no baseURL");
  const user = await createTestUser(db);
  await signInViaApi(page, user);
  await page
    .context()
    .addCookies([{ name: "NEXT_LOCALE", value: "it", url: baseURL }]);

  await openHydrated(page, REFUSED_ADDRESS);

  await expect(page).toHaveURL(`/it${REFUSED_ADDRESS}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  const texts = italian.Auth.error;
  await expect(refusalText(page, texts.linkNotConfirmed)).toBeVisible();
  await expect(
    refusalText(page, texts.linkNotConfirmedDescription),
  ).toBeVisible();
  await expect(refusalText(page, texts.linkNotConfirmedDetails)).toBeVisible();
  // The two buttons of the other errors lead to the sign-in options: this
  // visitor is signed in.
  await expect(
    page.locator("main").getByRole("button", { name: texts.tryEmailSignIn }),
  ).toHaveCount(0);

  await page.getByTestId("link-refused-to-account").click();

  await expect(page).toHaveURL("/it/account");
  await expect(
    page.locator("main").getByRole("heading", {
      level: 1,
      name: italian.Account.title,
      exact: true,
    }),
  ).toBeVisible({ timeout: 20_000 });
});

test("the address a refused link is sent to shows the refusal in the language of the browser when there is no NEXT_LOCALE cookie", async ({
  browser,
  baseURL,
}) => {
  // next-intl sets no NEXT_LOCALE cookie for a visitor whose browser language
  // is already the locale of the address, so the cookie alone would send that
  // visitor to the English page.
  const context = await browser.newContext({ baseURL, locale: "it-IT" });
  try {
    const page = await context.newPage();

    await page.goto(REFUSED_ADDRESS);

    expect(
      (await context.cookies()).filter((c) => c.name === "NEXT_LOCALE"),
    ).toEqual([]);
    await expect(page).toHaveURL(`/it${REFUSED_ADDRESS}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "it");
    await expect(
      refusalText(page, italian.Auth.error.linkNotConfirmed),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("the URL of the removed link-confirmation page answers 404", async ({
  page,
}) => {
  // The shape of the old links: the token was 32 random bytes in hex.
  const path = `/en/link-account/confirm/${"ab".repeat(32)}`;

  const res = await page.goto(path);
  if (!res) throw new Error(`page.goto(${path}) returned no document response`);

  expect(
    res.request().redirectedFrom()?.url(),
    `${path} was redirected`,
  ).toBeUndefined();
  expect(res.status()).toBe(404);
});
