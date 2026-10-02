import { test, expect, type Page } from "@playwright/test";
import {
  USERS,
  type TestUser,
  expectSignedOut,
  sessionUser,
  signInViaApi,
  signOutViaCookies,
  waitForSignedOutHome,
} from "../support/app";

/*
 * Authorization matrix of the role-gated pages. Every gate is a server-side
 * redirect() in the page component (src/app/[locale]/dashboard/page.tsx,
 * dashboard/user/page.tsx, dashboard/pro/page.tsx, admin/page.tsx). Next
 * answers it with an HTTP 307 before any page content is sent, so the tests
 * assert that hop and where it lands, then the page's own test id. The role
 * hierarchy is USER < PRO_USER < ADMIN (src/lib/auth/rbac.ts, hasRole).
 *
 * Sign-in goes through the credentials callback (signInViaApi): the subject
 * here is authorization, not the form. Every sign-in succeeds, so no failed
 * attempt, registration or 2FA code is spent from the rate-limit budget.
 *
 * The dashboard and admin pages are hardcoded English (no next-intl), so their
 * texts are asserted literally.
 */

const DASHBOARD = "/en/dashboard";
const USER_DASHBOARD = "/en/dashboard/user";
const PRO_DASHBOARD = "/en/dashboard/pro";
const ADMIN_PANEL = "/en/admin";
const SIGN_IN = "/en/auth/signin";

const endsWith = (path: string) => new RegExp(`${path}$`);

async function load(page: Page, path: string) {
  const res = await page.goto(path);
  if (!res) throw new Error(`page.goto(${path}) returned no document response`);
  return res;
}

/** The server renders `path` itself: status 200, no redirect hop. */
async function expectServed(page: Page, path: string) {
  const res = await load(page, path);
  expect(
    res.request().redirectedFrom()?.url(),
    `${path} was redirected`,
  ).toBeUndefined();
  expect(res.status()).toBe(200);
  await expect(page).toHaveURL(endsWith(path));
}

/** The server answers `path` with an HTTP redirect straight to `target`. */
async function expectServerRedirect(page: Page, path: string, target: string) {
  const res = await load(page, path);
  expect(
    res.request().redirectedFrom()?.url(),
    `${path} was not redirected by the server`,
  ).toBe(new URL(path, res.url()).href);
  expect(new URL(res.url()).pathname).toBe(target);
}

/** /en/dashboard/user rendered for `user` (the page stamps the session's role and e-mail). */
async function expectUserDashboardFor(page: Page, user: TestUser) {
  const dashboard = page.getByTestId("user-dashboard");
  await expect(dashboard).toBeVisible();
  await expect(dashboard).toHaveAttribute("data-user-role", user.role);
  await expect(dashboard).toHaveAttribute("data-user-email", user.email);
  await expect(
    dashboard.getByRole("heading", { level: 1, name: "User Dashboard" }),
  ).toBeVisible();
}

/** The one role-conditional card on /en/dashboard/user (rendered for USER only). */
const upgradeCard = (page: Page) =>
  page
    .getByTestId("user-dashboard")
    .getByRole("heading", { name: "Upgrade to Pro", exact: true });

test.describe("Role-based access control", () => {
  test.describe("signed out", () => {
    for (const path of [
      DASHBOARD,
      USER_DASHBOARD,
      PRO_DASHBOARD,
      ADMIN_PANEL,
    ]) {
      test(`${path} redirects to ${SIGN_IN}, which sends the visitor on to the signed-out home /en`, async ({
        page,
      }) => {
        await expectSignedOut(page);
        await expectServerRedirect(page, path, SIGN_IN);
        // auth/signin/page.tsx is a client page that router.replace()s to /en.
        await expect(page).toHaveURL(/\/en$/, { timeout: 20_000 });
        await waitForSignedOutHome(page);
      });
    }
  });

  test.describe("/en/dashboard picks the dashboard for the role", () => {
    const cases: { user: TestUser; target: string; testId: string }[] = [
      { user: USERS.user, target: USER_DASHBOARD, testId: "user-dashboard" },
      { user: USERS.pro, target: PRO_DASHBOARD, testId: "pro-dashboard" },
      { user: USERS.admin, target: ADMIN_PANEL, testId: "admin-panel" },
    ];
    for (const { user, target, testId } of cases) {
      test(`${user.role} is redirected from ${DASHBOARD} to ${target}`, async ({
        page,
      }) => {
        await signInViaApi(page, user);
        expect((await sessionUser(page))?.role).toBe(user.role);
        await expectServerRedirect(page, DASHBOARD, target);
        await expect(page.getByTestId(testId)).toBeVisible();
      });
    }
  });

  test.describe("USER", () => {
    test.beforeEach(async ({ page }) => {
      await signInViaApi(page, USERS.user);
    });

    test("is served /en/dashboard/user, stamped with role USER, with the Upgrade to Pro card", async ({
      page,
    }) => {
      await expectServed(page, USER_DASHBOARD);
      await expectUserDashboardFor(page, USERS.user);
      await expect(upgradeCard(page)).toBeVisible();
    });

    test("is redirected from /en/dashboard/pro to /en/dashboard/user", async ({
      page,
    }) => {
      await expectServerRedirect(page, PRO_DASHBOARD, USER_DASHBOARD);
      await expectUserDashboardFor(page, USERS.user);
      await expect(page.getByTestId("pro-dashboard")).toHaveCount(0);
    });

    test("is redirected from /en/admin to /en/dashboard/user", async ({
      page,
    }) => {
      await expectServerRedirect(page, ADMIN_PANEL, USER_DASHBOARD);
      await expectUserDashboardFor(page, USERS.user);
      await expect(page.getByTestId("admin-panel")).toHaveCount(0);
    });
  });

  test.describe("PRO_USER", () => {
    test.beforeEach(async ({ page }) => {
      await signInViaApi(page, USERS.pro);
    });

    test("is served /en/dashboard/pro", async ({ page }) => {
      await expectServed(page, PRO_DASHBOARD);
      const dashboard = page.getByTestId("pro-dashboard");
      await expect(dashboard).toBeVisible();
      await expect(
        dashboard.getByRole("heading", { level: 1, name: "Pro Dashboard" }),
      ).toBeVisible();
    });

    test("is served /en/dashboard/user, stamped with role PRO_USER, without the Upgrade to Pro card", async ({
      page,
    }) => {
      await expectServed(page, USER_DASHBOARD);
      await expectUserDashboardFor(page, USERS.pro);
      await expect(upgradeCard(page)).toHaveCount(0);
    });

    test("is redirected from /en/admin to /en/dashboard/user", async ({
      page,
    }) => {
      await expectServerRedirect(page, ADMIN_PANEL, USER_DASHBOARD);
      await expectUserDashboardFor(page, USERS.pro);
      await expect(page.getByTestId("admin-panel")).toHaveCount(0);
    });
  });

  test.describe("ADMIN", () => {
    test.beforeEach(async ({ page }) => {
      await signInViaApi(page, USERS.admin);
    });

    test("is served /en/admin: admin panel with the Administrator badge and the five most recent users", async ({
      page,
    }) => {
      await expectServed(page, ADMIN_PANEL);
      const panel = page.getByTestId("admin-panel");
      await expect(panel).toBeVisible();
      await expect(
        panel.getByRole("heading", { level: 1, name: "Admin Dashboard" }),
      ).toBeVisible();
      // Role badge: getRoleDisplayName("ADMIN") in src/lib/auth/rbac.ts.
      await expect(
        panel.getByText("Administrator", { exact: true }),
      ).toBeVisible();
      await expect(
        panel.getByText(`System administration panel - ${USERS.admin.name}`),
      ).toBeVisible();
      // "Recent Users" lists the newest accounts with take: 5; global-setup
      // seeds 6 users and no spec deletes any of them (session-revocation
      // deletes only a user it created itself), so the table is always full.
      await expect(
        panel.getByRole("heading", { name: "Recent Users", exact: true }),
      ).toBeVisible();
      await expect(panel.locator("table tbody tr")).toHaveCount(5);
    });

    test("is served /en/dashboard/pro and /en/dashboard/user (stamped with role ADMIN)", async ({
      page,
    }) => {
      await expectServed(page, PRO_DASHBOARD);
      await expect(page.getByTestId("pro-dashboard")).toBeVisible();

      await expectServed(page, USER_DASHBOARD);
      await expectUserDashboardFor(page, USERS.admin);
      await expect(upgradeCard(page)).toHaveCount(0);
    });
  });

  test("after switching the session from ADMIN to USER, /en/admin redirects to /en/dashboard/user", async ({
    page,
  }) => {
    await signInViaApi(page, USERS.admin);
    await expectServed(page, ADMIN_PANEL);
    await expect(page.getByTestId("admin-panel")).toBeVisible();

    await signOutViaCookies(page);
    await signInViaApi(page, USERS.user);
    await expectServerRedirect(page, ADMIN_PANEL, USER_DASHBOARD);
    await expectUserDashboardFor(page, USERS.user);
  });
});
