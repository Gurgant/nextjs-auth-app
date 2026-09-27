import { expect, type Locator, type Page } from "@playwright/test";
import { authenticator } from "otplib";

/**
 * Small, strict helpers for the E2E suite. Every helper either reaches the
 * state it promises or fails the test — nothing here swallows an error.
 */

/** Users created by e2e/global-setup.ts (recreated on every run). */
export const USERS = {
  user: {
    email: "test@example.com",
    password: "Test123!",
    name: "Test User",
    role: "USER",
  },
  pro: {
    email: "prouser@example.com",
    password: "Pro123!",
    name: "Pro User",
    role: "PRO_USER",
  },
  admin: {
    email: "admin@example.com",
    password: "Admin123!",
    name: "Admin User",
    role: "ADMIN",
  },
  twoFactor: {
    email: "2fa@example.com",
    password: "2FA123!",
    name: "2FA User",
    role: "PRO_USER",
    totpSecret: "JBSWY3DPEHPK3PXP",
  },
} as const;

export type TestUser = (typeof USERS)[keyof typeof USERS];

export const currentTotp = (secret: string = USERS.twoFactor.totpSecret) =>
  authenticator.generate(secret);

/** A unique address for sign-up tests (the users table is reset per run). */
export const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

/**
 * GET that retries only on a transport error (the dev server can reset a
 * connection while it compiles a route on first hit), never on a response:
 * the caller still asserts on whatever the server answered.
 */
async function getWithTransportRetry(page: Page, url: string, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await page.request.get(url);
    } catch (error) {
      if (attempt >= attempts) throw error;
    }
  }
}

export async function isGoogleEnabled(page: Page): Promise<boolean> {
  const res = await getWithTransportRetry(page, "/api/auth/providers");
  expect(res.ok()).toBeTruthy();
  return "google" in (await res.json());
}

/** The signed-in user according to the server, or null. */
export async function sessionUser(
  page: Page,
): Promise<{ email?: string; role?: string; name?: string } | null> {
  const res = await getWithTransportRetry(page, "/api/auth/session");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body?.user ?? null;
}

export async function expectSignedInAs(page: Page, email: string) {
  await expect
    .poll(async () => (await sessionUser(page))?.email ?? null, {
      timeout: 15_000,
    })
    .toBe(email);
}

export async function expectSignedOut(page: Page) {
  await expect
    .poll(async () => sessionUser(page), { timeout: 15_000 })
    .toBeNull();
}

/**
 * Wait until the signed-out home page is hydrated. Both markers are rendered
 * only on the client after the provider list is known: the Google button when
 * Google is configured, otherwise the e-mail form itself.
 */
export async function waitForSignedOutHome(page: Page) {
  await expect(
    page
      .getByTestId("sign-in-with-google-button")
      .or(page.locator("input#email")),
  ).toBeVisible({ timeout: 20_000 });
}

/** Open the e-mail sign-in form on /{locale}, whatever the Google setup. */
export async function openEmailSignIn(page: Page, locale = "en") {
  await page.goto(`/${locale}`);
  await waitForSignedOutHome(page);
  const toggle = page.getByTestId("sign-in-with-email-toggle");
  if (await toggle.isVisible()) {
    await toggle.click();
  }
  await expect(page.locator("input#email")).toBeVisible();
}

/** The credentials form's own alert (not Next's always-present route announcer). */
export const formAlert = (page: Page): Locator =>
  page.locator("form").getByRole("alert");

/** Fill and submit the e-mail sign-in form (the form must already be open). */
export async function submitCredentials(
  page: Page,
  email: string,
  password: string,
) {
  await page.locator("input#email").fill(email);
  await page.locator("input#password").fill(password);
  await page.locator('form button[type="submit"]').click();
}

/** Full UI sign-in for a user without 2FA; ends on /{locale}/account. */
export async function signInViaUi(page: Page, user: TestUser, locale = "en") {
  await openEmailSignIn(page, locale);
  await submitCredentials(page, user.email, user.password);
  await expect(page).toHaveURL(new RegExp(`/${locale}/account$`), {
    timeout: 20_000,
  });
  await expectSignedInAs(page, user.email);
}

/**
 * Sign in through the real credentials callback (no UI), for tests whose
 * subject is what happens after sign-in. Same contract the form uses.
 */
export async function signInViaApi(
  page: Page,
  user: TestUser,
  extra: Record<string, string> = {},
) {
  // Leave the app first: its background session polling shares the cookie
  // jar and can re-set the CSRF cookie between our GET and POST (MissingCSRF).
  await page.goto("about:blank");
  const { csrfToken } = await page.request
    .get("/api/auth/csrf")
    .then((r) => r.json());
  const res = await page.request.post("/api/auth/callback/credentials", {
    headers: { "X-Auth-Return-Redirect": "1" },
    form: {
      email: user.email,
      password: user.password,
      csrfToken,
      callbackUrl: "/en",
      ...extra,
    },
  });
  expect(res.ok()).toBeTruthy();
  await expectSignedInAs(page, user.email);
}

/** Drop the session cookie; the next request is anonymous. */
export async function signOutViaCookies(page: Page) {
  await page.goto("about:blank"); // stop the app's background requests first
  await page.context().clearCookies();
  await expectSignedOut(page);
}
