import { test, expect } from "@playwright/test";
import en from "../../messages/en.json";
import {
  USERS,
  apiGet,
  isGoogleEnabled,
  lastLoginMethodCookie,
  signInViaApi,
  signInViaUi,
  waitForSignedOutHome,
} from "../support/app";

/*
 * The method of the last successful sign-in is remembered in two places
 * (src/lib/auth/remember-login-method.ts): on the user row, shown on the
 * account page, and in a cookie, shown on the sign-in page when there are two
 * options to choose from.
 *
 * Rate-limit / lockout budget for this file: successful sign-ins only.
 */

test("a credentials sign-in is remembered in the cookie and on the account page", async ({
  page,
}) => {
  await page.goto("/en");
  await waitForSignedOutHome(page);
  expect(await lastLoginMethodCookie(page)).toBeNull();

  await signInViaUi(page, USERS.pro);

  // Readable by the page (not HttpOnly) and holding only the method name.
  expect(await lastLoginMethodCookie(page)).toMatchObject({
    value: "credentials",
    httpOnly: false,
    sameSite: "Lax",
    path: "/",
  });

  // signInViaUi ends on /en/account: the badge marks the e-mail method only.
  await expect(page.getByTestId("last-used-credentials")).toHaveText(
    en.Account.lastUsedMethod,
  );
  await expect(page.getByTestId("last-used-google")).toHaveCount(0);
});

test("/api/account/info reports the last sign-in method and no primary method", async ({
  page,
}) => {
  await signInViaApi(page, USERS.user);

  const res = await apiGet(page, "/api/account/info");
  expect(res.ok()).toBe(true);
  const { data } = await res.json();

  expect(data.lastLoginMethod).toBe("credentials");
  expect(data).not.toHaveProperty("primaryAuthMethod");
});

test("after signing out, the sign-in page marks the method used last — only when there are two options", async ({
  page,
}) => {
  await signInViaUi(page, USERS.pro);

  // Sign out through the app, which keeps the cookie (clearing all cookies
  // would remove it).
  await page.goto("/en");
  await page
    .getByTestId("authenticated-home")
    .getByRole("button", { name: en.Auth.signOut, exact: true })
    .click();
  await waitForSignedOutHome(page);
  await expect(page.getByTestId("authenticated-home")).toHaveCount(0);

  expect((await lastLoginMethodCookie(page))?.value).toBe("credentials");

  if (await isGoogleEnabled(page)) {
    // Two options: the e-mail one carries the badge, Google does not.
    await expect(page.getByTestId("last-used-credentials")).toHaveText(
      en.Auth.lastUsed,
    );
    await expect(page.getByTestId("last-used-google")).toHaveCount(0);
  } else {
    // One option: the form is shown directly and nothing is marked.
    await expect(page.locator("input#email")).toBeVisible();
    await expect(page.locator('[data-testid^="last-used-"]')).toHaveCount(0);
  }
});
