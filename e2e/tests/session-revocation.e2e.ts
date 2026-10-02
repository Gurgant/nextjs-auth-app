import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  USERS,
  cookieJarCopy,
  sessionCookies,
  sessionUser,
  signInViaApi,
  signOutViaApi,
  waitForSignedOutHome,
} from "../support/app";
import { createTestUser, openTestDatabase } from "../support/db";

/*
 * What ends a session on the server (src/lib/auth/session-revocation.ts): a
 * sign-out ends that one session; a deleted account and a password change end
 * every session of the user; a role change in the database reaches the open
 * session. Each effect is asked for once, at the next request to the server:
 * no test polls until it shows.
 *
 * Every sign-in succeeds and goes through the credentials callback
 * (signInViaApi), so no failed attempt, registration or 2FA code is spent
 * from the rate-limit budget; the one password change is one attempt of the
 * password-change limit. Tests that change a user create their own
 * (e2e/support/db.ts): the seeded users stay as other specs expect them.
 */

const db = openTestDatabase();

test.afterAll(async () => {
  await db.$disconnect();
});

test("after sign-out the token the browser held is refused, not re-issued", async ({
  page,
  baseURL,
}) => {
  await signInViaApi(page, USERS.user);
  // The cookie as it was before the sign-out: a copy of it, or a request
  // that reaches the server after the sign-out.
  const jar = await cookieJarCopy(page, baseURL);
  try {
    expect(sessionCookies((await jar.storageState()).cookies)).toHaveLength(1);

    await signOutViaApi(page);

    const res = await jar.get("/api/auth/session");
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toBeNull();
    expect(sessionCookies((await jar.storageState()).cookies)).toEqual([]);
  } finally {
    await jar.dispose();
  }
});

test("a session response that was in flight during sign-out cannot sign the browser back in", async ({
  page,
  baseURL,
}) => {
  await signInViaApi(page, USERS.user);
  const [issued] = sessionCookies(await page.context().cookies());

  // A session request that leaves before the sign-out: the server answers
  // with a re-issued cookie. The jar keeps that answer away from the browser.
  const jar = await cookieJarCopy(page, baseURL);
  try {
    const res = await jar.get("/api/auth/session");
    expect((await res.json())?.user?.email).toBe(USERS.user.email);
    const reissued = sessionCookies((await jar.storageState()).cookies);
    expect(reissued).toHaveLength(1);
    expect(reissued[0].value).not.toBe(issued.value);

    await signOutViaApi(page);
    expect(sessionCookies(await page.context().cookies())).toEqual([]);

    // Now the late answer arrives: the browser holds a session cookie again.
    await page.context().addCookies(reissued);
    expect(sessionCookies(await page.context().cookies())).toHaveLength(1);

    // It is the cookie of an ended session: refused, and removed by the
    // session endpoint.
    expect(await sessionUser(page)).toBeNull();
    expect(sessionCookies(await page.context().cookies())).toEqual([]);

    await page.goto("/en/account");
    await expect(page).toHaveURL(/\/en$/, { timeout: 20_000 });
    await waitForSignedOutHome(page);
  } finally {
    await jar.dispose();
  }
});

// That the sign-out ends its own session on the server is the first test of
// this file; here the browser's own cookie is gone either way.
test("sign-out does not end the user's other sessions", async ({
  page,
  browser,
  baseURL,
}) => {
  const otherBrowser = await browser.newContext({ baseURL });
  try {
    const otherPage = await otherBrowser.newPage();
    await signInViaApi(page, USERS.user);
    await signInViaApi(otherPage, USERS.user);

    await signOutViaApi(page);

    expect(await sessionUser(page)).toBeNull();
    expect((await sessionUser(otherPage))?.email).toBe(USERS.user.email);
  } finally {
    await otherBrowser.close();
  }
});

test("a role change in the database applies to the session already open", async ({
  page,
}) => {
  const admin = await createTestUser(db, { role: "ADMIN" });
  await signInViaApi(page, admin);

  await page.goto("/en/admin");
  await expect(page).toHaveURL(/\/en\/admin$/);
  await expect(page.getByTestId("admin-panel")).toBeVisible();

  await db.user.update({ where: { id: admin.id }, data: { role: "USER" } });

  // admin/page.tsx redirects everyone below ADMIN to the user dashboard.
  await page.goto("/en/admin");
  await expect(page).toHaveURL(/\/en\/dashboard\/user$/);
  await expect(page.getByTestId("user-dashboard")).toHaveAttribute(
    "data-user-role",
    "USER",
  );
  expect((await sessionUser(page))?.role).toBe("USER");
});

test("deleting the account ends its other sessions", async ({ page }) => {
  const user = await createTestUser(db);
  await signInViaApi(page, user);

  // Stands for a deletion made from another browser; the deletion form is not
  // the subject here.
  await db.user.delete({ where: { id: user.id } });

  // /en/account -> /en (AuthGuard, server): the page no longer sees a session.
  await page.goto("/en/account");
  await expect(page).toHaveURL(/\/en$/, { timeout: 20_000 });
  await waitForSignedOutHome(page);
  expect(await sessionUser(page)).toBeNull();
});

test("changing the password ends every session of the user, the one that changed it included", async ({
  page,
  browser,
  baseURL,
}) => {
  const user = await createTestUser(db);
  const newPassword = "Changed456!";
  const otherBrowser = await browser.newContext({ baseURL });
  let jar: APIRequestContext | undefined;
  try {
    const otherPage = await otherBrowser.newPage();
    await signInViaApi(page, user);
    await signInViaApi(otherPage, user);

    await page.goto("/en/account");
    // The form is rendered once the account info has loaded.
    await expect(page.locator("#currentPassword")).toBeVisible({
      timeout: 20_000,
    });

    // Hold the sign-out this browser starts after a successful change, so the
    // state between the change and that sign-out is observable (no timer).
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      (url) => url.pathname === "/api/auth/signout",
      async (route) => {
        await held;
        await route.continue();
      },
    );

    // The cookie of the browser that is about to change the password.
    jar = await cookieJarCopy(page, baseURL);
    expect(sessionCookies((await jar.storageState()).cookies)).toHaveLength(1);

    await page.locator("#currentPassword").fill(user.password);
    await page.locator("#newPassword").fill(newPassword);
    await page.locator("#confirmPassword").fill(newPassword);
    await page
      .locator('form:has(#currentPassword) button[type="submit"]')
      .click();

    // Hardcoded English in ChangePasswordCommand.
    await expect(
      page.getByText("Password changed successfully! Please sign in again."),
    ).toBeVisible();
    // The change itself ended both sessions; no sign-out has run yet. This
    // browser's token is presented from the copy: its own sign-out is held.
    expect(await (await jar.get("/api/auth/session")).json()).toBeNull();
    // Nor does the cookie this browser holds now open a session: the change
    // did not hand it a new one.
    const jarAfterChange = await cookieJarCopy(page, baseURL);
    try {
      expect(
        await (await jarAfterChange.get("/api/auth/session")).json(),
      ).toBeNull();
    } finally {
      await jarAfterChange.dispose();
    }
    await otherPage.goto("/en/account");
    await expect(otherPage).toHaveURL(/\/en$/, { timeout: 20_000 });
    await waitForSignedOutHome(otherPage);
    expect(await sessionUser(otherPage)).toBeNull();
    release();

    await expect(page).toHaveURL(/\/en$/, { timeout: 20_000 });
    await waitForSignedOutHome(page);
    expect(await sessionUser(page)).toBeNull();

    // The new password opens a new session. The old one is not tried: it
    // would spend a failed sign-in from the rate-limit budget.
    await signInViaApi(page, { email: user.email, password: newPassword });
  } finally {
    await jar?.dispose();
    await otherBrowser.close();
  }
});
