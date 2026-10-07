import { test, expect, type Page } from "@playwright/test";
import en from "../../messages/en.json";
import {
  apiGet,
  apiPost,
  currentTotp,
  expectSignedOut,
  formAlert,
  openEmailSignIn,
  submitCredentials,
} from "../support/app";
import {
  createTestUser,
  enableTwoFactorInDatabase,
  openTestDatabase,
} from "../support/db";

/*
 * After ENCRYPTION_KEY was changed. There is no key rotation: the TOTP secret
 * and the backup codes of a user who enabled 2FA stay encrypted with the old
 * key, and the server's key reads most of them as the empty text. Such a
 * user cannot sign in with e-mail and password until an operator clears the
 * 2FA columns (SECURITY.md), and nobody who knows the password gets past the
 * second factor:
 *   - the six digits that otplib computes for the empty secret are public,
 *     and the form sends them like any other code;
 *   - "-" as a backup code is the empty text once its hyphen is taken away;
 *     the form cannot send it, a hand-made request can.
 * Both used to sign in. validateTOTPCode and validateBackupCode
 * (src/lib/two-factor.ts) now accept nothing against a stored value that is
 * no whole secret or no whole code.
 *
 * The user is one of the test's own, with 2FA written into the database by a
 * key that is not the server's (e2e/support/db.ts).
 *
 * Rate-limit / lockout budget for this file: no failed password, no
 * registration; three refused codes, counted as failed 2FA attempts of that
 * own user only (five in 15 minutes per account, five for the lockout).
 */

const db = openTestDatabase();

test.afterAll(async () => {
  await db.$disconnect();
});

const TOTP_SECRET = "KRSXG5CTMVRXEZLU";
const CODES = ["K7QM-2XWA", "B4ND-9TCE", "R8HV-3YLP"] as const;

const submitButton = (page: Page) => page.locator('form button[type="submit"]');

/** The answer of Auth.js to a sign-in sent without the form: its error code. */
async function codeOfHandMadeSignIn(
  page: Page,
  fields: Record<string, string>,
): Promise<string | null> {
  const { csrfToken } = await apiGet(page, "/api/auth/csrf").then((r) =>
    r.json(),
  );
  const res = await apiPost(page, "/api/auth/callback/credentials", {
    headers: { "X-Auth-Return-Redirect": "1" },
    form: { ...fields, csrfToken, callbackUrl: "/en" },
  });
  expect(res.ok()).toBe(true);
  return new URL((await res.json()).url).searchParams.get("code");
}

test("with 2FA values written by another key, the password and the code of the empty secret do not sign in, and neither does '-' as a backup code", async ({
  page,
}) => {
  const user = await createTestUser(db);
  await enableTwoFactorInDatabase(db, user, {
    totpSecret: TOTP_SECRET,
    backupCodes: CODES,
    writtenWith: "another key",
  });
  const password = { email: user.email, password: user.password };
  const row = () =>
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { backupCodes: true, loginAttempts: true },
    });
  expect((await row()).backupCodes).toHaveLength(3);

  // Through the form: the password is right, and the code is the one that
  // anyone can compute for a secret that is the empty text.
  await openEmailSignIn(page);
  await submitCredentials(page, user.email, user.password);
  const totp = page.locator("input#totpCode");
  await expect(totp).toBeVisible();
  await totp.fill(currentTotp(""));
  await submitButton(page).click();

  await expect(formAlert(page)).toHaveText(
    en.CredentialsForm.invalidTwoFactorCode,
  );
  await expect(page).toHaveURL(/\/en$/);
  await expectSignedOut(page);

  // Without the form: "-" as a backup code.
  expect(
    await codeOfHandMadeSignIn(page, { ...password, backupCode: "-" }),
  ).toBe("2fa_invalid");
  await expectSignedOut(page);

  // The user's own code of the authenticator is no longer accepted either:
  // that is the lock-out the documents describe.
  expect(
    await codeOfHandMadeSignIn(page, {
      ...password,
      totpCode: currentTotp(TOTP_SECRET),
    }),
  ).toBe("2fa_invalid");
  await expectSignedOut(page);

  // Each of the three was a failed second factor of this account, and no
  // code was used up.
  const after = await row();
  expect(after.backupCodes).toHaveLength(3);
  expect(after.loginAttempts).toBe(3);
});
