import { test, expect } from "@playwright/test";
import en from "../../messages/en.json";
import {
  USERS,
  expectSignedInAs,
  expectSignedOut,
  sessionUser,
  signInViaApi,
  waitForSignedOutHome,
} from "../support/app";

/**
 * Role dashboards, the authenticated home and their access rules.
 *
 * Every signed-in test uses signInViaApi (the real credentials callback) and
 * then page.goto: only successful sign-ins, so this file spends no rate-limit,
 * lockout, registration or 2FA budget.
 *
 * The user dashboard and admin pages hardcode English
 * (src/app/[locale]/dashboard/user/page.tsx, src/app/[locale]/admin/page.tsx),
 * so their strings are asserted literally. The home and account pages use
 * next-intl, so their strings are read from messages/en.json.
 */

const HOME_URL = /^https?:\/\/[^/]+\/en$/;
const USER_DASHBOARD_URL = /\/en\/dashboard\/user$/;
const ADMIN_URL = /\/en\/admin$/;
const ACCOUNT_URL = /\/en\/account$/;

// The home page and the account page render their content on the client.
const CLIENT_RENDER = { timeout: 20_000 };

const homeWelcome = (name: string) =>
  en.Home.welcomeBack.replace("{name}", name);

test.describe("User dashboard", () => {
  test("/en/dashboard redirects a signed-in USER to /en/dashboard/user", async ({
    page,
  }) => {
    await signInViaApi(page, USERS.user);

    await page.goto("/en/dashboard");

    await expect(page).toHaveURL(USER_DASHBOARD_URL);
    const dashboard = page.getByTestId("user-dashboard");
    await expect(dashboard).toHaveAttribute("data-user-role", USERS.user.role);
    // Hardcoded English in dashboard/user/page.tsx.
    await expect(
      dashboard.getByRole("heading", {
        level: 1,
        name: "User Dashboard",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("user dashboard shows the signed-in user's name, email and verified status", async ({
    page,
  }) => {
    await signInViaApi(page, USERS.user);

    await page.goto("/en/dashboard/user");

    const dashboard = page.getByTestId("user-dashboard");
    await expect(dashboard).toHaveAttribute(
      "data-user-email",
      USERS.user.email,
    );
    // Hardcoded English in dashboard/user/page.tsx.
    await expect(
      dashboard.getByText(`Welcome back, ${USERS.user.name}!`, { exact: true }),
    ).toBeVisible();
    await expect(
      dashboard.getByText(USERS.user.email, { exact: true }),
    ).toBeVisible();
    await expect(
      dashboard.getByText(USERS.user.name, { exact: true }),
    ).toBeVisible();
    // e2e/global-setup.ts seeds this user with emailVerified set.
    await expect(
      dashboard.getByText("Verified", { exact: true }),
    ).toBeVisible();
  });

  test("'Security Settings' link goes to /en/account with the password and 2FA sections", async ({
    page,
  }) => {
    await signInViaApi(page, USERS.user);
    await page.goto("/en/dashboard/user");

    // Hardcoded English link text in dashboard/user/page.tsx.
    const link = page
      .getByTestId("user-dashboard")
      .getByRole("link", { name: /Security Settings/ });
    await expect(link).toHaveAttribute("href", "/en/account");
    await link.click();

    await expect(page).toHaveURL(ACCOUNT_URL);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: en.Account.title,
        exact: true,
      }),
    ).toBeVisible(CLIENT_RENDER);
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: en.Account.passwordManagement,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: en.Account.twoFactorAuthentication,
        exact: true,
      }),
    ).toBeVisible();
  });

  test("'Edit Profile' link goes to /en/account with the Profile Information section", async ({
    page,
  }) => {
    await signInViaApi(page, USERS.user);
    await page.goto("/en/dashboard/user");

    // Hardcoded English link text in dashboard/user/page.tsx.
    const link = page
      .getByTestId("user-dashboard")
      .getByRole("link", { name: /Edit Profile/ });
    await expect(link).toHaveAttribute("href", "/en/account");
    await link.click();

    await expect(page).toHaveURL(ACCOUNT_URL);
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: en.Account.profile,
        exact: true,
      }),
    ).toBeVisible(CLIENT_RENDER);
  });
});

test.describe("Authenticated home", () => {
  test("session survives a reload: the home still greets the user after page.reload()", async ({
    page,
  }) => {
    await signInViaApi(page, USERS.user);
    await page.goto("/en");

    const home = page.getByTestId("authenticated-home");
    await expect(home).toHaveAttribute(
      "data-session-email",
      USERS.user.email,
      CLIENT_RENDER,
    );

    await page.reload();

    // Only rendered once the client session is restored with a user.
    await expect(home).toHaveAttribute(
      "data-session-email",
      USERS.user.email,
      CLIENT_RENDER,
    );
    await expect(
      home.getByRole("heading", {
        level: 2,
        name: homeWelcome(USERS.user.name),
        exact: true,
      }),
    ).toBeVisible();
    await expectSignedInAs(page, USERS.user.email);
  });

  test("'Go to Dashboard' on the home takes a USER to /en/dashboard/user", async ({
    page,
  }) => {
    await signInViaApi(page, USERS.user);
    await page.goto("/en");

    const link = page.getByTestId("go-to-dashboard-button");
    await expect(link).toHaveText(en.Auth.goToDashboard, CLIENT_RENDER);
    await expect(link).toHaveAttribute("href", "/en/dashboard/user");
    await link.click();

    await expect(page).toHaveURL(USER_DASHBOARD_URL);
    await expect(page.getByTestId("user-dashboard")).toHaveAttribute(
      "data-user-email",
      USERS.user.email,
    );
  });

  test("'Sign out' on the home ends the session and returns to the signed-out /en", async ({
    page,
  }) => {
    await signInViaApi(page, USERS.user);
    await page.goto("/en");

    const home = page.getByTestId("authenticated-home");
    const signOut = home.getByRole("button", {
      name: en.Auth.signOut,
      exact: true,
    });
    await expect(signOut).toBeVisible(CLIENT_RENDER);
    await signOut.click();

    await expect(home).toBeHidden(CLIENT_RENDER);
    await waitForSignedOutHome(page);
    await expect(page).toHaveURL(HOME_URL);
    // The server is the judge: the session cookie is gone.
    await expectSignedOut(page);
  });
});

test.describe("Access control", () => {
  // Each page redirects server-side to /en/auth/signin, which then
  // client-replaces to /en (src/app/[locale]/auth/signin/page.tsx).
  for (const path of ["/en/dashboard", "/en/dashboard/user", "/en/admin"]) {
    test(`${path} without a session ends on /en showing the sign-in home`, async ({
      page,
    }) => {
      await page.goto(path);

      await expect(page).toHaveURL(HOME_URL, CLIENT_RENDER);
      await waitForSignedOutHome(page);
      await expect(page.getByTestId("authenticated-home")).toHaveCount(0);
    });
  }

  test("/en/dashboard redirects an ADMIN to /en/admin, which shows the admin panel", async ({
    page,
  }) => {
    await signInViaApi(page, USERS.admin);
    expect((await sessionUser(page))?.role).toBe(USERS.admin.role);

    await page.goto("/en/dashboard");

    await expect(page).toHaveURL(ADMIN_URL);
    const panel = page.getByTestId("admin-panel");
    // Hardcoded English in admin/page.tsx.
    await expect(
      panel.getByRole("heading", {
        level: 1,
        name: "Admin Dashboard",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      panel.getByText(`System administration panel - ${USERS.admin.name}`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      panel.getByRole("link", { name: "Manage Users", exact: true }),
    ).toHaveAttribute("href", "/en/admin/users");
  });

  test("a USER opening /en/admin is redirected to /en/dashboard/user without the admin panel", async ({
    page,
  }) => {
    await signInViaApi(page, USERS.user);

    // Make the admin panel due: ask for it directly.
    await page.goto("/en/admin");

    await expect(page).toHaveURL(USER_DASHBOARD_URL);
    await expect(page.getByTestId("user-dashboard")).toHaveAttribute(
      "data-user-role",
      USERS.user.role,
    );
    await expect(page.getByTestId("admin-panel")).toHaveCount(0);
  });
});
