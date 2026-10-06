import { test, expect, type Page } from "@playwright/test";
import es from "../../messages/es.json";
import {
  USERS,
  apiGet,
  apiPost,
  expectSignedOut,
  signInViaApi,
  waitForSignedOutHome,
} from "../support/app";

/*
 * Where the browser is sent after a sign-in, a link or a sign-out: the
 * `redirect` callback of src/lib/auth-config.ts. An address on this origin is
 * kept as it was asked for, in every language, unless it carries a user name
 * or a password; anything else becomes the base URL.
 *
 * What this file measures: a sign-out in a browser, in a language other than
 * English, and what the running Auth.js answers when it is asked to return to
 * an address. It does NOT complete a Google sign-in: that Auth.js sends the
 * browser to the address of its callback-url cookie when Google returns was
 * read in the source of @auth/core 0.41.3 (docs/TESTING.md). The cookie itself
 * is measured here. The rule is unit-tested case by case
 * (src/lib/__tests__/auth-config.redirect.test.ts).
 *
 * Rate-limit budget for this file: 0 registrations, 0 failed sign-ins, 0 2FA
 * codes. test@example.com signs in successfully once.
 */

/** The address Auth.js keeps for the return from a provider, or null. */
async function callbackUrlCookie(page: Page): Promise<string | null> {
  const cookies = await page.context().cookies();
  const cookie = cookies.find((c) => c.name.endsWith("authjs.callback-url"));
  return cookie ? decodeURIComponent(cookie.value) : null;
}

test("the Sign out button on the Spanish home ends the session and brings back the Spanish sign-in page", async ({
  page,
}) => {
  await signInViaApi(page, USERS.user);
  await page.goto("/es");

  const home = page.getByTestId("authenticated-home");
  await expect(home).toHaveAttribute("data-session-email", USERS.user.email);

  await home
    .getByRole("button", { name: es.Auth.signOut, exact: true })
    .click();

  // What the user sees first, then the server (as in auth-login.e2e.ts).
  await waitForSignedOutHome(page);
  await expect(home).toHaveCount(0);
  await expect(page).toHaveURL(/\/es$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expectSignedOut(page);
});

test("Auth.js answers with the address that was asked for when it is on this origin, in every language, and with the base URL otherwise", async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error("The Playwright config sets no baseURL");
  const base = new URL(baseURL).origin;

  // The sign-out endpoint, without a session: it runs the same step as every
  // other request to Auth.js (the `callbackUrl` of the request goes through
  // the `redirect` callback), ends nothing and spends nothing.
  const { csrfToken } = await apiGet(page, "/api/auth/csrf").then((r) =>
    r.json(),
  );
  const answers: Record<string, { url: string; cookie: string | null }> = {};
  const expected: typeof answers = {};
  const ask = async (callbackUrl: string, url: string) => {
    const res = await apiPost(page, "/api/auth/signout", {
      headers: { "X-Auth-Return-Redirect": "1" },
      form: { csrfToken, callbackUrl },
    });
    expect(res.ok()).toBeTruthy();
    answers[callbackUrl] = {
      url: (await res.json()).url,
      cookie: await callbackUrlCookie(page),
    };
    expected[callbackUrl] = { url, cookie: url };
  };

  // Kept: what "Sign in with Google" and the link of the account page ask
  // for under the English locale and under two others, an address with a
  // query string and a fragment, and an absolute URL of this origin. One
  // address for each of the five locales.
  await ask("/en/account", `${base}/en/account`);
  await ask("/de/account", `${base}/de/account`);
  await ask("/it/account", `${base}/it/account`);
  await ask(
    "/es/account?tab=security#password",
    `${base}/es/account?tab=security#password`,
  );
  await ask(`${base}/fr`, `${base}/fr`);
  // Refused: each of these is the base URL with something after it, or a
  // path that a browser reads as another host.
  await ask(`${base}0/account`, base);
  await ask(`${base}@evil.test/account`, base);
  await ask(`${base}.evil.test/account`, base);
  await ask("//evil.test/account", base);
  await ask("/\\evil.test/account", base);

  // One comparison, so that a failure shows every answer together.
  expect(answers).toStrictEqual(expected);
});
