import { test, expect, type Page } from "@playwright/test";
import en from "../../messages/en.json";
import {
  expectSignedInAs,
  expectSignedOut,
  openEmailSignIn,
  submitCredentials,
  uniqueEmail,
} from "../support/app";

/**
 * The terms checkbox on /{locale}/register (src/components/auth/registration-form.tsx):
 * - the submit button is `disabled={!agreed || isLoading}`, where `agreed` is
 *   the checkbox's controlled React state;
 * - the checkbox itself is `required`, so native constraint validation blocks
 *   any submit path that does not go through the button.
 * The server action (registerUser, src/lib/actions/auth.ts) does not look at
 * `terms`, so these two client-side guards are the whole feature.
 */

// Hardcoded English in src/lib/commands/auth/register-user.command.ts, not in messages/*.json.
const REGISTERED = "Account created successfully! Please sign in.";
// Meets passwordSchema (src/lib/validation/schemas.ts): upper, lower, digit, special, >= 8.
const PASSWORD = "Terms123!";

function registrationForm(page: Page) {
  const form = page
    .locator("form")
    .filter({ has: page.locator("input#terms") });
  return {
    form,
    terms: form.getByRole("checkbox", {
      name: en.Registration.agreeToTerms,
      exact: true,
    }),
    submit: form.getByRole("button", {
      name: en.Registration.createAccount,
      exact: true,
    }),
  };
}

/**
 * Check the terms box once React is listening. A click before hydration only
 * toggles the DOM box, and React's `agreed` state (which drives the button) may
 * never see it. Nothing on this page marks hydration, so retry uncheck + check
 * until the button reacts: an enabled button is the proof.
 */
async function acceptTerms(page: Page) {
  const { terms, submit } = registrationForm(page);
  await expect(async () => {
    await terms.uncheck();
    await terms.check();
    await expect(submit).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

async function fillEverythingButTerms(page: Page, email: string) {
  const { form } = registrationForm(page);
  await form.locator("input#name").fill("Terms Tester");
  await form.locator("input#email").fill(email);
  await form.locator("input#password").fill(PASSWORD);
  await form.locator("input#confirmPassword").fill(PASSWORD);
}

test.describe("Registration terms checkbox", () => {
  test("submit stays disabled while terms is unchecked, even with every other field valid, and enables when it is checked", async ({
    page,
  }) => {
    await page.goto("/en/register");
    const { form, terms, submit } = registrationForm(page);

    await expect(terms).not.toBeChecked();
    await expect(submit).toBeDisabled();

    // Enabled here means hydrated and driven by the checkbox.
    await acceptTerms(page);
    await terms.uncheck();
    await expect(submit).toBeDisabled();

    // All other fields valid: the only invalid control is the terms box, and
    // the button is still disabled.
    await fillEverythingButTerms(page, uniqueEmail("terms-toggle"));
    await expect(form.locator("input:invalid")).toHaveAttribute("id", "terms");
    await expect(submit).toBeDisabled();

    await terms.check();
    await expect(form.locator("input:invalid")).toHaveCount(0);
    await expect(submit).toBeEnabled();
    await expect(page).toHaveURL(/\/en\/register$/);
  });

  test("without terms, Enter and requestSubmit() send no request; after checking it, exactly one request registers the same e-mail, which can then sign in", async ({
    page,
  }) => {
    // A server action call is a POST carrying a Next-Action header.
    const actionPosts: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.headers()["next-action"]) {
        actionPosts.push(req.url());
      }
    });

    await page.goto("/en/register");
    const { form, terms, submit } = registrationForm(page);

    // Hydrated from here on: a submit event would now reach registerUser.
    await acceptTerms(page);
    await terms.uncheck();
    await expect(submit).toBeDisabled();

    const email = uniqueEmail("terms");
    await fillEverythingButTerms(page, email);

    // Implicit submission: does nothing while the default button is disabled.
    await form.locator("input#confirmPassword").press("Enter");
    // requestSubmit() skips the button; the checkbox's `required` blocks it.
    await form.evaluate((f) => (f as HTMLFormElement).requestSubmit());

    await expect(form.locator("input:invalid")).toHaveAttribute("id", "terms");
    await expect(form.getByRole("alert")).toHaveCount(0);
    await expect(page).toHaveURL(/\/en\/register$/);

    // Make the request due, so the silence above means something: the same
    // listener must now see exactly one POST (so the attempts above sent none),
    // and the server must still treat the e-mail as new (an earlier
    // registration would answer "User already exists" instead).
    await terms.check();
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(form.getByRole("alert")).toHaveText(REGISTERED);
    expect(actionPosts).toHaveLength(1);

    // registration-form.tsx pushes /{locale}?registered=true 2 s after
    // success; registering does not sign the user in.
    await expect(page).toHaveURL(/\/en\?registered=true$/);
    await expectSignedOut(page);

    // The account exists with the password typed into the form.
    await openEmailSignIn(page);
    await submitCredentials(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/en\/account$/, { timeout: 20_000 });
    await expectSignedInAs(page, email);
  });
});
