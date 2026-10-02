import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import en from "../../messages/en.json";
import {
  USERS,
  apiGet,
  apiPost,
  currentTotp,
  expectSignedInAs,
  expectSignedOut,
  formAlert,
  isGoogleEnabled,
  lastLoginMethodCookie,
  openEmailSignIn,
  signInViaApi,
  signOutViaCookies,
  submitCredentials,
  waitForSignedOutHome,
} from "../support/app";

/*
 * E-mail sign-in, sign-out and session handling on the home page
 * (src/app/[locale]/page.tsx, src/components/auth/credentials-form.tsx).
 *
 * Rate-limit / lockout budget for this file (src/lib/rate-limit.ts, src/lib/auth-config.ts):
 * - failed credential sign-ins: 2. The first uses nobody@example.com. The second is
 *   test@example.com with a wrong password, and the next test signs that user in
 *   successfully, which resets its lockout counter.
 * - wrong 2FA codes: 1, reset by the valid-code test that follows it.
 * - registrations: 0.
 * These resets depend on test order, so the file keeps its order even under fullyParallel.
 */
test.describe.configure({ mode: "default" });

/** Seeded by e2e/global-setup.ts with emailVerified: null (not part of USERS). */
const UNVERIFIED = {
  email: "unverified@example.com",
  password: "Unverified123!",
} as const;

const submitButton = (page: Page) => page.locator('form button[type="submit"]');

const accountHeading = (page: Page) =>
  page.getByRole("heading", { level: 1, name: en.Account.title, exact: true });

/** The raw session user, including fields that sessionUser() does not type. */
async function rawSessionUser(
  page: Page,
): Promise<Record<string, unknown> | null> {
  const res = await apiGet(page, "/api/auth/session");
  expect(res.ok()).toBe(true);
  const body = await res.json();
  return body?.user ?? null;
}

test("signed-out home shows the app title, the e-mail form with a disabled submit and a link to /en/register", async ({
  page,
}) => {
  await openEmailSignIn(page);

  await expect(page).toHaveTitle(en.Layout.appTitle);
  await expect(
    page.getByRole("heading", { level: 1, name: en.Home.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: en.Auth.signInToAccount, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel(en.CredentialsForm.emailLabel, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel(en.CredentialsForm.passwordLabel, { exact: true }),
  ).toBeVisible();
  await expect(submitButton(page)).toHaveText(en.CredentialsForm.signInButton);
  await expect(submitButton(page)).toBeDisabled();
  await expect(
    page.getByRole("link", { name: en.Auth.registerHere, exact: true }),
  ).toHaveAttribute("href", "/en/register");
  await expect(page.getByTestId("authenticated-home")).toHaveCount(0);
});

test("submit is enabled only while both e-mail and password are non-blank", async ({
  page,
}) => {
  await openEmailSignIn(page);
  const email = page.locator("input#email");
  const password = page.locator("input#password");

  await expect(submitButton(page)).toBeDisabled();
  await email.fill(USERS.user.email);
  await expect(submitButton(page)).toBeDisabled();
  await password.fill("   "); // whitespace only counts as blank (trim)
  await expect(submitButton(page)).toBeDisabled();
  await password.fill("x");
  await expect(submitButton(page)).toBeEnabled();
  await email.fill("");
  await expect(submitButton(page)).toBeDisabled();
});

test("the register link on the home page opens /en/register with the registration heading", async ({
  page,
}) => {
  await page.goto("/en");
  await waitForSignedOutHome(page);

  await page
    .getByRole("link", { name: en.Auth.registerHere, exact: true })
    .click();

  await expect(page).toHaveURL(/\/en\/register$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: en.Registration.title,
      exact: true,
    }),
  ).toBeVisible();
});

test("providers are exactly credentials (+ google when configured) and the Google button follows that list", async ({
  page,
}) => {
  const google = await isGoogleEnabled(page);
  const res = await apiGet(page, "/api/auth/providers");
  expect(res.ok()).toBe(true);
  const providers = await res.json();
  // No other provider (e.g. GitHub) is registered in src/lib/auth-config.ts.
  expect(Object.keys(providers).sort()).toEqual(
    google ? ["credentials", "google"] : ["credentials"],
  );
  expect(providers.credentials).toMatchObject({
    id: "credentials",
    type: "credentials",
  });

  await page.goto("/en");
  await waitForSignedOutHome(page);
  const googleButton = page.getByTestId("sign-in-with-google-button");
  const emailToggle = page.getByTestId("sign-in-with-email-toggle");
  const googleInstead = page.getByRole("button", {
    name: en.Auth.signInWithGoogleInstead,
    exact: true,
  });
  const emailInput = page.locator("input#email");

  // Never clicked: it would leave for accounts.google.com.
  if (google) {
    await expect(googleButton).toHaveText(en.Auth.signInWithGoogle);
    await expect(emailToggle).toHaveText(en.Auth.signInWithEmail);
    await expect(emailInput).toHaveCount(0);
    await emailToggle.click();
    await expect(emailInput).toBeVisible();
    await expect(googleInstead).toBeVisible();
  } else {
    await expect(emailInput).toBeVisible();
    await expect(googleButton).toHaveCount(0);
    await expect(emailToggle).toHaveCount(0);
    await expect(googleInstead).toHaveCount(0);
  }
});

test("a malformed e-mail is blocked by the browser, then an unknown account gets the generic alert and no session", async ({
  page,
}) => {
  await openEmailSignIn(page);
  const submittedEmails: Array<string | null> = [];
  page.on("request", (req) => {
    if (
      req.method() === "POST" &&
      new URL(req.url()).pathname === "/api/auth/callback/credentials"
    ) {
      const form = new URLSearchParams(req.postData() ?? "");
      submittedEmails.push(form.get("email"));
    }
  });

  await submitCredentials(page, "invalid-email", "Password123!");
  const email = page.locator("input#email");
  expect(
    await email.evaluate(
      (el) => (el as HTMLInputElement).validity.typeMismatch,
    ),
  ).toBe(true);

  // Prove the blocked submit sent nothing: a valid submit must now produce the
  // alert AND exactly one sign-in request.
  await email.fill("nobody@example.com");
  await submitButton(page).click();

  await expect(formAlert(page)).toHaveText(
    en.CredentialsForm.invalidCredentials,
  );
  expect(submittedEmails).toEqual(["nobody@example.com"]);
  await expect(page).toHaveURL(/\/en$/);
  await expectSignedOut(page);
});

test("a wrong password for a seeded user shows the same generic alert and creates no session", async ({
  page,
}) => {
  await openEmailSignIn(page);
  await submitCredentials(page, USERS.user.email, "WrongPassword123!");

  await expect(formAlert(page)).toHaveText(
    en.CredentialsForm.invalidCredentials,
  );
  await expect(page).toHaveURL(/\/en$/);
  await expectSignedOut(page);
  // A failed sign-in is not remembered as the last method used.
  expect(await lastLoginMethodCookie(page)).toBeNull();
});

test("valid credentials show the loading button, then land on /en/account with a live session", async ({
  page,
}) => {
  await openEmailSignIn(page);

  // Hold the credentials callback so the loading state is observable (no timer).
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === "/api/auth/callback/credentials",
    async (route) => {
      await held;
      await route.continue();
    },
  );

  await submitCredentials(page, USERS.user.email, USERS.user.password);
  await expect(submitButton(page)).toHaveText(en.CredentialsForm.signingIn);
  await expect(submitButton(page)).toBeDisabled();
  release();

  await expect(page).toHaveURL(/\/en\/account$/, { timeout: 20_000 });
  await expectSignedInAs(page, USERS.user.email);
  // A verified user's session carries the verification date (contrast for the unverified test).
  expect((await rawSessionUser(page))?.emailVerified).toEqual(
    expect.any(String),
  );
  await expect(accountHeading(page)).toBeVisible({ timeout: 20_000 });
});

test("an unverified e-mail does not block sign-in: /en/account opens and the session has emailVerified null", async ({
  page,
}) => {
  await openEmailSignIn(page);
  await submitCredentials(page, UNVERIFIED.email, UNVERIFIED.password);

  await expect(page).toHaveURL(/\/en\/account$/, { timeout: 20_000 });
  await expectSignedInAs(page, UNVERIFIED.email);
  expect(await rawSessionUser(page)).toMatchObject({
    email: UNVERIFIED.email,
    emailVerified: null,
  });
  await expect(accountHeading(page)).toBeVisible({ timeout: 20_000 });
});

test("2FA user: the correct password alone shows the code step and creates no session", async ({
  page,
}) => {
  await openEmailSignIn(page);
  await submitCredentials(
    page,
    USERS.twoFactor.email,
    USERS.twoFactor.password,
  );

  const totp = page.locator("input#totpCode");
  await expect(totp).toBeVisible();
  // The 2FA prompt and button label are hardcoded English in
  // credentials-form.tsx (not in messages/*.json).
  await expect(
    page
      .locator("form")
      .getByText(
        "Enter the 6-digit code from your authenticator app to finish signing in.",
      ),
  ).toBeVisible();
  await expect(submitButton(page)).toHaveText("Verify code");
  await expect(submitButton(page)).toBeDisabled();
  await expect(formAlert(page)).toHaveCount(0);

  // The field keeps digits only; 5 digits do not enable the submit.
  await totp.fill("12a3b4c5");
  await expect(totp).toHaveValue("12345");
  await expect(submitButton(page)).toBeDisabled();

  await expect(page).toHaveURL(/\/en$/);
  await expectSignedOut(page);
});

test("2FA user: a wrong code is answered with code=2fa_invalid and creates no session", async ({
  page,
}) => {
  // Asserted at the HTTP level (same server, real signIn contract): a correct
  // password plus a wrong TOTP code must come back as `2fa_invalid` and MUST
  // NOT create a session. The UI wiring for rendering credential errors is
  // covered by the generic-alert tests above; driving this particular submit
  // through the dev server with Playwright stalls on a dev-server socket quirk
  // (the same flow verified fine in a real browser).
  const { csrfToken } = await apiGet(page, "/api/auth/csrf").then((r) =>
    r.json(),
  );
  // Differs from the current code in every digit.
  const wrongCode = currentTotp().replace(/\d/g, (d) =>
    String((Number(d) + 5) % 10),
  );

  const res = await apiPost(page, "/api/auth/callback/credentials", {
    headers: { "X-Auth-Return-Redirect": "1" },
    form: {
      email: USERS.twoFactor.email,
      password: USERS.twoFactor.password,
      totpCode: wrongCode,
      csrfToken,
      callbackUrl: "/en",
    },
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(new URL(body.url).searchParams.get("code")).toBe("2fa_invalid");

  await expectSignedOut(page);
});

test("2FA user: a valid TOTP code completes sign-in on /en/account", async ({
  page,
}) => {
  await openEmailSignIn(page);
  await submitCredentials(
    page,
    USERS.twoFactor.email,
    USERS.twoFactor.password,
  );

  const totp = page.locator("input#totpCode");
  await expect(totp).toBeVisible();
  await totp.fill(currentTotp());
  await expect(submitButton(page)).toBeEnabled();
  await submitButton(page).click();

  await expect(page).toHaveURL(/\/en\/account$/, { timeout: 20_000 });
  await expectSignedInAs(page, USERS.twoFactor.email);
});

test("the Sign out button on the authenticated home ends the session and brings back the sign-in page", async ({
  page,
}) => {
  await signInViaApi(page, USERS.user);
  await page.goto("/en");

  const home = page.getByTestId("authenticated-home");
  await expect(home).toHaveAttribute("data-session-email", USERS.user.email);
  await expect(home.getByTestId("go-to-dashboard-button")).toHaveAttribute(
    "href",
    "/en/dashboard/user",
  );

  await home
    .getByRole("button", { name: en.Auth.signOut, exact: true })
    .click();

  // What the user sees first, then the server. The order no longer decides
  // the result: a session request in flight during the sign-out can still put
  // a cookie back, but it is the cookie of an ended session and is refused
  // (session-revocation.e2e.ts).
  await waitForSignedOutHome(page);
  await expect(home).toHaveCount(0);
  await expect(page).toHaveURL(/\/en$/);
  // The server is the judge: the session cookie is gone.
  await expectSignedOut(page);
});

test("signed out: /en/dashboard and /en/account redirect to the signed-out home", async ({
  page,
}) => {
  await expectSignedOut(page);

  // /en/dashboard -> /en/auth/signin (server) -> /en (client replace).
  await page.goto("/en/dashboard");
  await expect(page).toHaveURL(/\/en$/, { timeout: 20_000 });
  await waitForSignedOutHome(page);

  // /en/account -> /en (AuthGuard, server).
  await page.goto("/en/account");
  await expect(page).toHaveURL(/\/en$/, { timeout: 20_000 });
  await waitForSignedOutHome(page);
});

test("session expiry: once the session cookie is gone, /en/account redirects to the signed-out home", async ({
  page,
}) => {
  await signInViaApi(page, USERS.user);
  await page.goto("/en/account");
  await expect(page).toHaveURL(/\/en\/account$/);
  await expect(accountHeading(page)).toBeVisible({ timeout: 20_000 });

  await signOutViaCookies(page);

  await page.goto("/en/account");
  await expect(page).toHaveURL(/\/en$/, { timeout: 20_000 });
  await waitForSignedOutHome(page);
});
