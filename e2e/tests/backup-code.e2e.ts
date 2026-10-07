import { test, expect, type Page } from "@playwright/test";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import {
  USERS,
  expectSignedInAs,
  expectSignedOut,
  formAlert,
  openEmailSignIn,
  signOutViaCookies,
  submitCredentials,
} from "../support/app";
import {
  createTestUser,
  enableTwoFactorInDatabase,
  openTestDatabase,
} from "../support/db";

/*
 * A backup code at sign-in (src/components/auth/credentials-form.tsx). A user
 * who has lost the authenticator app chooses "Use a backup code instead" in
 * the code step and types one of the codes of the file that the 2FA set-up
 * made them download. authorize() (src/lib/auth-config.ts) checks the code
 * against the encrypted ones of the user and removes the one it accepts: a
 * code signs in once.
 *
 * The user is one of the test's own, with 2FA turned on in the database and
 * three codes the test knows (e2e/support/db.ts): no seeded user changes, and
 * no e-mail is sent.
 *
 * Rate-limit / lockout budget for this file: no failed password, no
 * registration. One refused backup code, which counts as one failed 2FA
 * attempt of that own user only (five in 15 minutes, per account); the
 * sign-in after it clears the count. The French test sends the correct
 * password of the seeded 2FA user and no code.
 */

const db = openTestDatabase();

test.afterAll(async () => {
  await db.$disconnect();
});

// As the file writes them: eight letters and digits, a hyphen in the middle.
const CODES = ["K7QM-2XWA", "B4ND-9TCE", "R8HV-3YLP"] as const;
const TOTP_SECRET = "KRSXG5CTMVRXEZLU";

const form = (page: Page) => page.locator("form");
const submitButton = (page: Page) => page.locator('form button[type="submit"]');

/** The codes the user row holds, by their number. */
const codesLeft = async (userId: string) =>
  (
    await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { backupCodes: true },
    })
  ).backupCodes.length;

/** The password step, then the switch from the authenticator code to a backup code. */
async function openBackupCodeField(
  page: Page,
  user: { email: string; password: string },
) {
  await openEmailSignIn(page);
  await submitCredentials(page, user.email, user.password);
  await expect(page.locator("input#totpCode")).toBeVisible();
  await page
    .getByRole("button", {
      name: en.CredentialsForm.useBackupCode,
      exact: true,
    })
    .click();
  const field = page.getByLabel(en.CredentialsForm.backupCodeLabel, {
    exact: true,
  });
  await expect(field).toHaveAttribute("id", "backupCode");
  return field;
}

test("a user with 2FA signs in with a backup code, the account page shows one code fewer, and the same code is refused the second time", async ({
  page,
}) => {
  const user = await createTestUser(db);
  await enableTwoFactorInDatabase(db, user, {
    totpSecret: TOTP_SECRET,
    backupCodes: CODES,
  });
  expect(await codesLeft(user.id)).toBe(3);

  // The password is right, and the code step offers the other kind of code.
  const field = await openBackupCodeField(page, user);
  await expect(
    form(page).getByText(en.CredentialsForm.backupCodeHint, { exact: true }),
  ).toBeVisible();
  await expect(page.locator("input#totpCode")).toHaveCount(0);
  await expect(submitButton(page)).toHaveText(
    en.CredentialsForm.verifyCodeButton,
  );
  await expect(submitButton(page)).toBeDisabled();

  // As a person types it from the file: lower case, a space for the hyphen.
  await field.fill(CODES[0].toLowerCase().replace("-", " "));
  await expect(field).toHaveValue(CODES[0]);
  await expect(submitButton(page)).toBeEnabled();
  await submitButton(page).click();

  await expect(page).toHaveURL(/\/en\/account$/, { timeout: 20_000 });
  await expectSignedInAs(page, user.email);
  // The code is used up: the account page counts one fewer, and so does
  // the row.
  await expect(
    page.getByText(en.Account.backupCodesAvailable.replace("{count}", "2"), {
      exact: true,
    }),
  ).toBeVisible({ timeout: 20_000 });
  expect(await codesLeft(user.id)).toBe(2);

  // The same code a second time: refused, with the answer of a wrong code,
  // and no session.
  await signOutViaCookies(page);
  const again = await openBackupCodeField(page, user);
  await again.fill(CODES[0]);
  await submitButton(page).click();

  await expect(formAlert(page)).toHaveText(
    en.CredentialsForm.invalidTwoFactorCode,
  );
  await expect(again).toHaveValue(CODES[0]);
  await expect(page).toHaveURL(/\/en$/);
  await expectSignedOut(page);
  expect(await codesLeft(user.id)).toBe(2);

  // The refusal was about that code: the next one of the file signs in.
  await again.fill(CODES[1]);
  await submitButton(page).click();

  await expect(page).toHaveURL(/\/en\/account$/, { timeout: 20_000 });
  await expectSignedInAs(page, user.email);
  expect(await codesLeft(user.id)).toBe(1);
});

test("under /fr the backup-code field of the code step is in French, and the way back leads to the authenticator code", async ({
  page,
}) => {
  // A correct password is no failed sign-in: nothing is spent from the budget.
  await openEmailSignIn(page, "fr");
  await submitCredentials(
    page,
    USERS.twoFactor.email,
    USERS.twoFactor.password,
  );
  await expect(page.locator("input#totpCode")).toBeVisible();

  await page
    .getByRole("button", {
      name: fr.CredentialsForm.useBackupCode,
      exact: true,
    })
    .click();

  await expect(
    page.getByLabel(fr.CredentialsForm.backupCodeLabel, { exact: true }),
  ).toHaveAttribute("id", "backupCode");
  await expect(
    form(page).getByText(fr.CredentialsForm.backupCodeHint, { exact: true }),
  ).toBeVisible();
  const back = page.getByRole("button", {
    name: fr.CredentialsForm.useAuthenticatorCode,
    exact: true,
  });
  await expect(back).toBeVisible();
  // Nothing of it is English. The same searches find the English texts on
  // the English page (the test above).
  await expect(
    page.getByLabel(en.CredentialsForm.backupCodeLabel, { exact: true }),
  ).toHaveCount(0);
  await expect(
    form(page).getByText(en.CredentialsForm.backupCodeHint, { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: en.CredentialsForm.useAuthenticatorCode,
      exact: true,
    }),
  ).toHaveCount(0);

  await back.click();

  await expect(page.locator("input#totpCode")).toBeVisible();
  await expect(page.locator("input#backupCode")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: fr.CredentialsForm.useBackupCode,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/fr$/);
  await expectSignedOut(page);
});
