import {
  test,
  expect,
  type Page,
  type Request as NetworkRequest,
} from "@playwright/test";
import en from "../../messages/en.json";
import {
  expectSignedInAs,
  expectSignedOut,
  formAlert,
  openEmailSignIn,
  submitCredentials,
  uniqueEmail,
  waitForSignedOutHome,
} from "../support/app";

/**
 * /{locale}/register: RegistrationForm (src/components/auth/registration-form.tsx)
 * calls the registerUser server action (src/lib/actions/auth.ts), which runs
 * RegisterUserCommand (src/lib/commands/auth/register-user.command.ts).
 *
 * Rate-limit budget: registerUser counts EVERY call, 5 per 60 min keyed by
 * [email, client IP] (src/lib/rate-limit.ts). Exactly four submissions in this
 * file reach the server: the new account, its duplicate, the weak password and
 * the mismatched confirmation (terms-validation.e2e.ts adds one: 5 in total).
 * The native-validation and loading tests abort their request in the browser,
 * so it never reaches the server. No failed sign-ins, no 2FA codes.
 */

// What RegisterUserCommand answers comes from the message files, in the
// locale of the form (the `Success` and `Errors` namespaces): the success, a
// form that fails the command's schema, an address that is taken.
const SIGN_UP_SUCCESS = en.Success.accountCreated;
const VALIDATION_FAILED = en.Errors.validationFailed;
const USER_EXISTS = en.Errors.userAlreadyExists;

// passwordSchema (src/lib/validation/schemas.ts): >= 8, upper, lower, digit, special.
const STRONG_PASSWORD = "Regist3r!Pass";
const OTHER_STRONG_PASSWORD = "0ther!Passw0rd";
// Passes the input's native minLength=8, fails passwordSchema (no upper, digit, special).
const WEAK_PASSWORD = "weakpassword";

// The home page of the locale and nothing after it: no path, no query.
const HOME_URL = /^https?:\/\/[^/]+\/en$/;

const submitButton = (page: Page) => page.locator('form button[type="submit"]');

const termsCheckbox = (page: Page) =>
  page.getByRole("checkbox", {
    name: en.Registration.agreeToTerms,
    exact: true,
  });

const registrationHeading = (page: Page) =>
  page.getByRole("heading", { level: 1, name: en.Registration.title });

/**
 * Reach the form through the hydrated home page's "Register here" link. The
 * client-side navigation renders the form with React already attached, so the
 * controlled terms checkbox reacts to the first click (a direct page.goto
 * gives no signal that hydration has finished).
 */
async function openRegistrationForm(page: Page) {
  await page.goto("/en");
  await waitForSignedOutHome(page);
  await page
    .getByRole("link", { name: en.Auth.registerHere, exact: true })
    .click();
  await expect(page).toHaveURL(/\/en\/register$/, { timeout: 20_000 });
  await expect(registrationHeading(page)).toBeVisible();
}

async function fillSignUpForm(
  page: Page,
  fields: { name: string; email: string; password: string },
) {
  await page.locator("input#name").fill(fields.name);
  await page.locator("input#email").fill(fields.email);
  await page.locator("input#password").fill(fields.password);
  await page.locator("input#confirmPassword").fill(fields.password);
}

async function acceptTerms(page: Page) {
  await termsCheckbox(page).check();
  await expect(submitButton(page)).toBeEnabled();
}

// A server action call is a POST carrying a Next-Action header; registerUser is
// the only server action on this page.
const isSignUpRequest = (req: NetworkRequest) =>
  req.method() === "POST" && req.headers()["next-action"] !== undefined;

/**
 * Record the sign-up requests the page sends and abort them in the browser
 * once `hold` settles: they never reach registerUser or its rate limit.
 */
async function interceptSignUpRequests(
  page: Page,
  hold: Promise<void> = Promise.resolve(),
): Promise<NetworkRequest[]> {
  const sent: NetworkRequest[] = [];
  page.on("request", (req) => {
    if (isSignUpRequest(req)) sent.push(req);
  });
  await page.route(
    (url) => url.pathname === "/en/register",
    async (route) => {
      if (!isSignUpRequest(route.request())) return route.fallback();
      await hold;
      return route.abort();
    },
  );
  return sent;
}

test.describe("Registration (/en/register)", () => {
  test("renders the sign-up form: 'Auth App' title, heading, labelled fields, unchecked terms, disabled 'Create Account'", async ({
    page,
  }) => {
    await page.goto("/en/register");

    await expect(page).toHaveTitle(en.Layout.appTitle);
    await expect(registrationHeading(page)).toBeVisible();
    for (const label of [
      en.Registration.fullName,
      en.Registration.emailAddress,
      en.Registration.createPassword,
      en.Registration.confirmPassword,
    ]) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }
    await expect(termsCheckbox(page)).not.toBeChecked();
    await expect(submitButton(page)).toHaveText(en.Registration.createAccount);
    await expect(submitButton(page)).toBeDisabled();
  });

  test("'Sign in here' leads to the sign-in home page, whose 'Register here' leads back", async ({
    page,
  }) => {
    await page.goto("/en/register");
    await page
      .getByRole("link", { name: en.Auth.signInHere, exact: true })
      .click();
    await expect(page).toHaveURL(/\/en$/);
    await waitForSignedOutHome(page);

    await page
      .getByRole("link", { name: en.Auth.registerHere, exact: true })
      .click();
    await expect(page).toHaveURL(/\/en\/register$/, { timeout: 20_000 });
    await expect(registrationHeading(page)).toBeVisible();
  });

  test("the terms checkbox gates the submit button: disabled, enabled when checked, disabled again when unchecked", async ({
    page,
  }) => {
    await openRegistrationForm(page);
    await fillSignUpForm(page, {
      name: "Terms Gate",
      email: uniqueEmail("e2e-terms-gate"),
      password: STRONG_PASSWORD,
    });
    await expect(submitButton(page)).toBeDisabled();

    await acceptTerms(page);
    await termsCheckbox(page).uncheck();
    await expect(submitButton(page)).toBeDisabled();
  });

  test("native validation blocks an invalid e-mail: no sign-up request leaves the browser until the address is valid", async ({
    page,
  }) => {
    await openRegistrationForm(page);
    const sent = await interceptSignUpRequests(page);

    await fillSignUpForm(page, {
      name: "Native Check",
      email: "invalid-email",
      password: STRONG_PASSWORD,
    });
    await acceptTerms(page);
    await submitButton(page).click();

    const email = page.locator("input#email");
    expect(
      await email.evaluate((el: HTMLInputElement) => el.validity.typeMismatch),
    ).toBe(true);

    // Make the request due: with a valid address the same click must send one
    // request, so a request from the first click would make this two.
    await email.fill(uniqueEmail("e2e-native"));
    const due = page.waitForRequest(isSignUpRequest);
    await submitButton(page).click();
    await due;
    expect(sent).toHaveLength(1);
  });

  test("while the sign-up request is in flight the button reads 'Creating account...' and is disabled", async ({
    page,
  }) => {
    await openRegistrationForm(page);
    let release!: () => void;
    const sent = await interceptSignUpRequests(
      page,
      new Promise<void>((resolve) => {
        release = () => resolve();
      }),
    );

    await fillSignUpForm(page, {
      name: "Loading Check",
      email: uniqueEmail("e2e-loading"),
      password: STRONG_PASSWORD,
    });
    await acceptTerms(page);
    await submitButton(page).click();

    await expect(submitButton(page)).toHaveText(en.Registration.creating);
    await expect(submitButton(page)).toBeDisabled();
    await expect.poll(() => sent.length).toBe(1);

    // The held request is now aborted in the browser: loading ends and the
    // failure is shown instead of being swallowed.
    release();
    await expect(submitButton(page)).toHaveText(en.Registration.createAccount);
    await expect(submitButton(page)).toBeEnabled();
    await expect(formAlert(page)).toBeVisible();
  });

  test("a password that fails the server-side policy is refused with 'Validation failed', which clears after 5 s", async ({
    page,
  }) => {
    await openRegistrationForm(page);
    await fillSignUpForm(page, {
      name: "Weak Password",
      email: uniqueEmail("e2e-weak"),
      password: WEAK_PASSWORD,
    });
    await acceptTerms(page);
    await submitButton(page).click();

    await expect(formAlert(page)).toHaveText(VALIDATION_FAILED);
    await expect(page).toHaveURL(/\/en\/register$/);
    // resetDelay: 5000 in registration-form.tsx removes the message.
    await expect(formAlert(page)).toHaveCount(0, { timeout: 10_000 });
  });

  test("a password confirmation that does not match is refused with 'Validation failed'", async ({
    page,
  }) => {
    // The match is checked only on the server (registerSchema refine in
    // register-user.command.ts); the form has no client-side check.
    await openRegistrationForm(page);
    await page.locator("input#name").fill("Mismatch");
    await page.locator("input#email").fill(uniqueEmail("e2e-mismatch"));
    await page.locator("input#password").fill(STRONG_PASSWORD);
    await page.locator("input#confirmPassword").fill(OTHER_STRONG_PASSWORD);
    await acceptTerms(page);
    await submitButton(page).click();

    await expect(formAlert(page)).toHaveText(VALIDATION_FAILED);
    await expect(page).toHaveURL(/\/en\/register$/);
  });

  test.describe("a new account", () => {
    // One fresh e-mail shared in order: created, refused as a duplicate, signed in.
    test.describe.configure({ mode: "serial" });
    const email = uniqueEmail("e2e-register");

    test("valid sign-up shows the success message, goes to the home page /en and does not sign in", async ({
      page,
    }) => {
      await openRegistrationForm(page);
      await fillSignUpForm(page, {
        name: "E2E Registrant",
        email,
        password: STRONG_PASSWORD,
      });
      await acceptTerms(page);
      await submitButton(page).click();

      await expect(formAlert(page)).toHaveText(SIGN_UP_SUCCESS);
      // onSuccess pushes /{locale} after 2 s: the address has no query.
      await expect(page).toHaveURL(HOME_URL);
      await waitForSignedOutHome(page);
      await expectSignedOut(page);
    });

    test("registering the same e-mail again is refused with 'User already exists'", async ({
      page,
    }) => {
      await openRegistrationForm(page);
      await fillSignUpForm(page, {
        name: "Second Attempt",
        email,
        password: OTHER_STRONG_PASSWORD,
      });
      await acceptTerms(page);
      await submitButton(page).click();

      await expect(formAlert(page)).toHaveText(USER_EXISTS);
      await expect(page).toHaveURL(/\/en\/register$/);
    });

    test("the new account signs in with its sign-up password (the refused duplicate changed nothing)", async ({
      page,
    }) => {
      await openEmailSignIn(page);
      await submitCredentials(page, email, STRONG_PASSWORD);
      await expect(page).toHaveURL(/\/en\/account$/, { timeout: 20_000 });
      await expectSignedInAs(page, email);
    });
  });
});
