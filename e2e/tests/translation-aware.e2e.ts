import { test, expect } from "@playwright/test";
import { isGoogleEnabled, waitForSignedOutHome } from "../support/app";
import enMessages from "../../messages/en.json";
import esMessages from "../../messages/es.json";
import frMessages from "../../messages/fr.json";
import itMessages from "../../messages/it.json";
import deMessages from "../../messages/de.json";

/**
 * The expected UI text comes from the message files next-intl serves
 * (src/i18n.ts loads messages/<locale>.json), never from a table kept in the
 * test. No sign-in, no registration submit: this file uses no rate-limit
 * budget.
 */
const MESSAGES = {
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  it: itMessages,
  de: deMessages,
};
type Locale = keyof typeof MESSAGES;
// Mirrors `locales` in src/i18n.ts (not imported: it pulls in next-intl/server).
const LOCALES: Locale[] = ["en", "es", "fr", "it", "de"];

/** [dotted path, value] for every leaf of a messages object. */
function leaves(node: unknown, prefix = ""): Array<[string, unknown]> {
  if (typeof node !== "object" || node === null || Array.isArray(node)) {
    return [[prefix, node]];
  }
  return Object.entries(node).flatMap(([key, value]) =>
    leaves(value, prefix ? `${prefix}.${key}` : key),
  );
}

test.describe("UI text comes from messages/<locale>.json", () => {
  test("every locale file has exactly the keys of en.json, all non-empty strings", () => {
    const expected = leaves(MESSAGES.en).map(([path]) => path);
    expect(expected.length).toBeGreaterThan(0);

    for (const locale of LOCALES) {
      const entries = leaves(MESSAGES[locale]);
      const paths = entries.map(([path]) => path);
      expect(
        {
          missing: expected.filter((path) => !paths.includes(path)),
          extra: paths.filter((path) => !expected.includes(path)),
          blank: entries
            .filter(([, value]) => typeof value !== "string" || !value.trim())
            .map(([path]) => path),
        },
        `messages/${locale}.json`,
      ).toEqual({ missing: [], extra: [], blank: [] });
    }
  });

  for (const locale of LOCALES) {
    test(`/${locale} home shows Home.title and the e-mail sign-in entry point`, async ({
      page,
    }) => {
      const m = MESSAGES[locale];
      await page.goto(`/${locale}`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await waitForSignedOutHome(page);

      // The nav's own <h1> (Layout.appTitle) sits outside <main>.
      const main = page.locator("main");
      await expect(main.getByRole("heading", { level: 1 })).toHaveText(
        m.Home.title,
      );

      const googleButton = page.getByTestId("sign-in-with-google-button");
      const emailToggle = page.getByTestId("sign-in-with-email-toggle");
      const googleInstead = main.getByRole("button", {
        name: m.Auth.signInWithGoogleInstead,
        exact: true,
      });
      if (await isGoogleEnabled(page)) {
        // Chooser first: Google button plus the e-mail toggle.
        await expect(googleButton).toHaveText(m.Auth.signInWithGoogle);
        await expect(emailToggle).toHaveText(m.Auth.signInWithEmail);
        await emailToggle.click();
        await expect(googleInstead).toBeVisible();
      } else {
        // No Google provider: the e-mail form is the page, no chooser at all.
        await expect(googleButton).toHaveCount(0);
        await expect(emailToggle).toHaveCount(0);
        await expect(googleInstead).toHaveCount(0);
      }

      // The e-mail form, in both configurations.
      await expect(main.getByRole("heading", { level: 3 })).toHaveText(
        m.Auth.signInToAccount,
      );
      await expect(
        main.getByLabel(m.CredentialsForm.emailLabel, { exact: true }),
      ).toHaveAttribute("id", "email");
      await expect(
        main.getByLabel(m.CredentialsForm.passwordLabel, { exact: true }),
      ).toHaveAttribute("id", "password");
      await expect(main.locator('form button[type="submit"]')).toHaveText(
        m.CredentialsForm.signInButton,
      );
      await expect(
        main.getByRole("link", { name: m.Auth.registerHere, exact: true }),
      ).toHaveAttribute("href", `/${locale}/register`);
    });
  }

  for (const locale of LOCALES) {
    test(`/${locale}/register labels each field with its Registration.* text`, async ({
      page,
    }) => {
      const r = MESSAGES[locale].Registration;
      await page.goto(`/${locale}/register`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/register$`));

      await expect(
        page.locator("main").getByRole("heading", { level: 1 }),
      ).toHaveText(r.title);

      // Each label must point at its own input (<label htmlFor={id}>).
      const form = page.locator("main form");
      await expect(
        form.getByLabel(r.fullName, { exact: true }),
      ).toHaveAttribute("id", "name");
      await expect(
        form.getByLabel(r.emailAddress, { exact: true }),
      ).toHaveAttribute("id", "email");
      await expect(
        form.getByLabel(r.createPassword, { exact: true }),
      ).toHaveAttribute("id", "password");
      await expect(
        form.getByLabel(r.confirmPassword, { exact: true }),
      ).toHaveAttribute("id", "confirmPassword");
      await expect(
        form.getByLabel(r.agreeToTerms, { exact: true }),
      ).toHaveAttribute("id", "terms");
      await expect(form.locator('button[type="submit"]')).toHaveText(
        r.createAccount,
      );
    });
  }
});
