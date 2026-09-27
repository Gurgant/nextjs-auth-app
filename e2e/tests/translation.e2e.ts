import { test, expect, type Page } from "@playwright/test";
import {
  USERS,
  expectSignedInAs,
  expectSignedOut,
  formAlert,
  isGoogleEnabled,
  openEmailSignIn,
  signInViaApi,
  submitCredentials,
  waitForSignedOutHome,
} from "../support/app";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";
import italian from "../../messages/it.json";
import de from "../../messages/de.json";

/**
 * Locale routing and translated UI. Expected text is read from
 * messages/<locale>.json, the files next-intl serves (src/i18n.ts).
 *
 * Rate-limit budget for this file: 0 registrations, 2 failed sign-ins (both
 * for the unknown nobody@example.com, so no seeded account moves toward
 * lockout), 0 2FA codes. test@example.com signs in successfully 3 times.
 */

// Mirrors `locales` in src/i18n.ts (not imported: it pulls in next-intl/server).
const LOCALES = ["en", "es", "fr", "it", "de"] as const;
type Locale = (typeof LOCALES)[number];
const MESSAGES = { en, es, fr, it: italian, de };

const UNKNOWN_EMAIL = "nobody@example.com";

/** The nav holds its own <h1> (Layout.appTitle), so page headings are scoped to <main>. */
const mainHeading = (page: Page, level: number) =>
  page.locator("main").getByRole("heading", { level });

/** Home.welcomeBack is an ICU template: "Welcome back, {name}!". */
const withName = (template: string, name: string) =>
  template.replace("{name}", name);

/** Hardcoded English template in language-selector.tsx; only the name is translated. */
const selectorLabel = (nativeName: string) =>
  `Current language: ${nativeName}. Click to change language.`;

test.describe("Locale routing", () => {
  test("unprefixed / redirects to /en for an en-US browser with no locale cookie", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(mainHeading(page, 1)).toHaveText(en.Home.title);
  });

  for (const locale of LOCALES) {
    test(`/${locale} serves lang="${locale}", Home.title and the Layout.appTitle page title`, async ({
      page,
    }) => {
      const m = MESSAGES[locale];
      await page.goto(`/${locale}`);
      await expect(page).toHaveURL(new RegExp(`/${locale}$`));
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(mainHeading(page, 1)).toHaveText(m.Home.title);
      await expect(
        page.locator("nav").getByRole("heading", { level: 1 }),
      ).toHaveText(m.Layout.appTitle);
      await expect(page).toHaveTitle(m.Layout.appTitle);
    });
  }
});

test.describe("Translated sign-in", () => {
  test("sign-in entry point and e-mail form are translated on /en, /es and /fr (Google button only when configured)", async ({
    page,
  }) => {
    const google = await isGoogleEnabled(page);
    const locales: Locale[] = ["en", "es", "fr"];

    for (const locale of locales) {
      const m = MESSAGES[locale];
      await page.goto(`/${locale}`);
      await waitForSignedOutHome(page);

      const googleButton = page.getByTestId("sign-in-with-google-button");
      const emailToggle = page.getByTestId("sign-in-with-email-toggle");
      if (google) {
        await expect(googleButton).toHaveText(m.Auth.signInWithGoogle);
        await expect(emailToggle).toHaveText(m.Auth.signInWithEmail);
        await emailToggle.click();
      } else {
        // Without the Google provider the e-mail form is shown directly.
        await expect(googleButton).toHaveCount(0);
        await expect(emailToggle).toHaveCount(0);
      }

      await expect(mainHeading(page, 3)).toHaveText(m.Auth.signInToAccount);
      await expect(page.locator('main form button[type="submit"]')).toHaveText(
        m.CredentialsForm.signInButton,
      );
    }
  });

  // credentials-form.tsx: any non-2FA sign-in error shows t("invalidCredentials").
  for (const locale of ["en", "es"] as const) {
    test(`/${locale}: rejected credentials show CredentialsForm.invalidCredentials in the form alert and no session`, async ({
      page,
    }) => {
      const m = MESSAGES[locale];
      await openEmailSignIn(page, locale);
      await submitCredentials(page, UNKNOWN_EMAIL, "Wrong-password-1");

      await expect(formAlert(page)).toHaveText(
        m.CredentialsForm.invalidCredentials,
      );
      await expect(page).toHaveURL(new RegExp(`/${locale}$`));
      await expectSignedOut(page);
    });
  }

  for (const locale of ["es", "fr"] as const) {
    test(`full sign-in in ${locale}: translated labels, lands on /${locale}/account (Account.title) with a session`, async ({
      page,
    }) => {
      const m = MESSAGES[locale];
      const main = page.locator("main");
      await openEmailSignIn(page, locale);

      await expect(
        main.getByLabel(m.CredentialsForm.emailLabel, { exact: true }),
      ).toHaveAttribute("id", "email");
      await expect(
        main.getByLabel(m.CredentialsForm.passwordLabel, { exact: true }),
      ).toHaveAttribute("id", "password");

      await submitCredentials(page, USERS.user.email, USERS.user.password);

      await expect(page).toHaveURL(new RegExp(`/${locale}/account$`), {
        timeout: 20_000,
      });
      await expectSignedInAs(page, USERS.user.email);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(mainHeading(page, 1)).toHaveText(m.Account.title, {
        timeout: 20_000,
      });
    });
  }
});

test.describe("Authenticated home", () => {
  test("Home.welcomeBack interpolates the user's name and the dashboard link keeps the locale, on /en and /es", async ({
    page,
  }) => {
    await signInViaApi(page, USERS.user);

    for (const locale of ["en", "es"] as const) {
      const m = MESSAGES[locale];
      await page.goto(`/${locale}`);

      const home = page.getByTestId("authenticated-home");
      await expect(home.getByRole("heading", { level: 2 })).toHaveText(
        withName(m.Home.welcomeBack, USERS.user.name),
      );
      const dashboardLink = home.getByTestId("go-to-dashboard-button");
      await expect(dashboardLink).toHaveText(m.Auth.goToDashboard);
      await expect(dashboardLink).toHaveAttribute(
        "href",
        `/${locale}/dashboard/user`,
      );
    }
  });
});

test.describe("Language selector and persistence", () => {
  test("nav selector lists the 5 languages with English selected; choosing Español moves to /es", async ({
    page,
  }) => {
    await page.goto("/en");
    // Hydration barrier: the trigger is server-rendered but only React opens it.
    await waitForSignedOutHome(page);

    const nav = page.locator("nav");
    const trigger = nav.getByRole("button", {
      name: selectorLabel(en.Languages.en.nativeName),
      exact: true,
    });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(nav.getByRole("option")).toHaveCount(0);

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(
      nav.getByText(en.Common.selectLanguage, { exact: true }),
    ).toBeVisible();
    const options = nav.getByRole("option");
    await expect(options).toHaveCount(5);
    await expect(options).toContainText(
      LOCALES.map((l) => en.Languages[l].nativeName),
    );
    const selected = nav.getByRole("option", { selected: true });
    await expect(selected).toHaveCount(1);
    await expect(selected).toContainText(en.Languages.en.nativeName);

    await options.filter({ hasText: en.Languages.es.nativeName }).click();

    await expect(page).toHaveURL(/\/es$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(mainHeading(page, 1)).toHaveText(es.Home.title);
    await expect(
      nav.getByRole("button", {
        name: selectorLabel(es.Languages.es.nativeName),
        exact: true,
      }),
    ).toBeVisible();
  });

  test("after visiting /es, in-app links stay in /es and the NEXT_LOCALE cookie sends unprefixed URLs to /es", async ({
    page,
  }) => {
    await page.goto("/es");
    await waitForSignedOutHome(page);
    // next-intl's middleware stores the locale when it differs from the
    // browser's Accept-Language (en-US here); unprefixed URLs then use it.
    await expect
      .poll(
        async () =>
          (await page.context().cookies()).find((c) => c.name === "NEXT_LOCALE")
            ?.value ?? null,
      )
      .toBe("es");

    await page
      .locator("main")
      .getByRole("link", { name: es.Auth.registerHere, exact: true })
      .click();
    await expect(page).toHaveURL(/\/es\/register$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(mainHeading(page, 1)).toHaveText(es.Registration.title);
    const form = page.locator("main form");
    await expect(
      form.getByLabel(es.Registration.emailAddress, { exact: true }),
    ).toHaveAttribute("id", "email");
    await expect(
      form.getByLabel(es.Registration.createPassword, { exact: true }),
    ).toHaveAttribute("id", "password");

    await page.goto("/");
    await expect(page).toHaveURL(/\/es$/);
    await expect(mainHeading(page, 1)).toHaveText(es.Home.title);

    await page.goto("/register");
    await expect(page).toHaveURL(/\/es\/register$/);
  });
});
