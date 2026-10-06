import { test, expect } from "@playwright/test";
import {
  isGoogleEnabled,
  plainText,
  taggedText,
  waitForSignedOutHome,
} from "../support/app";
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
    test(`/${locale} home shows Home.title, the ways to sign in on this server and the e-mail sign-in entry point`, async ({
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

      // The line under the title says how one can sign in, and the
      // description of the page is the same sentence. It names Google only
      // where the server offers Google.
      const google = await isGoogleEnabled(page);
      const waysToSignIn = google
        ? m.Home.subtitle
        : m.Home.subtitleWithoutGoogle;
      await expect(main.getByTestId("home-subtitle")).toHaveText(waysToSignIn);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        "content",
        waysToSignIn,
      );

      const googleButton = page.getByTestId("sign-in-with-google-button");
      const emailToggle = page.getByTestId("sign-in-with-email-toggle");
      const googleInstead = main.getByRole("button", {
        name: m.Auth.signInWithGoogleInstead,
        exact: true,
      });
      if (google) {
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

  // The server knows whether Google is configured and sends that with the
  // page (GoogleSignInProvider in the layout): the first HTML is the page as
  // it stays.
  test.describe("in a browser that runs no script", () => {
    test.use({ javaScriptEnabled: false });

    test("the first HTML of the home page holds the sentence about the ways to sign in on this server and the entry that goes with it, in the five locales", async ({
      page,
    }) => {
      const google = await isGoogleEnabled(page);

      for (const locale of LOCALES) {
        const m = MESSAGES[locale];
        await page.goto(`/${locale}`);

        const main = page.locator("main");
        await expect(main.getByRole("heading", { level: 1 })).toHaveText(
          m.Home.title,
        );
        await expect(main.getByTestId("home-subtitle")).toHaveText(
          google ? m.Home.subtitle : m.Home.subtitleWithoutGoogle,
        );
        const emailToggle = page.getByTestId("sign-in-with-email-toggle");
        const emailField = main.locator("input#email");
        if (google) {
          // The chooser; the e-mail form comes with a click.
          await expect(emailToggle).toHaveText(m.Auth.signInWithEmail);
          await expect(emailField).toHaveCount(0);
        } else {
          // The e-mail form itself, and no chooser.
          await expect(emailField).toBeVisible();
          await expect(emailToggle).toHaveCount(0);
        }
      }
    });
  });

  test("/en home does not ask for the provider list: what it shows came with the page", async ({
    page,
  }) => {
    const m = MESSAGES.en;
    const google = await isGoogleEnabled(page);
    const asked = { providers: 0, session: 0 };
    page.on("request", (request) => {
      const { pathname } = new URL(request.url());
      if (pathname === "/api/auth/providers") asked.providers += 1;
      if (pathname === "/api/auth/session") asked.session += 1;
    });

    await page.goto("/en");
    await waitForSignedOutHome(page);
    await expect(page.locator("main").getByTestId("home-subtitle")).toHaveText(
      google ? m.Home.subtitle : m.Home.subtitleWithoutGoogle,
    );

    // The listener saw the request that the page does send, for the session:
    // its silence about the provider list means something.
    expect(asked.session).toBeGreaterThan(0);
    expect(asked.providers).toBe(0);
  });

  for (const locale of LOCALES) {
    test(`/${locale}/register labels each field with its Registration.* text and links the two documents of its terms sentence`, async ({
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
      // The terms sentence holds two links: the label of the checkbox is its
      // text, and each link leads to its page under this locale.
      await expect(
        form.getByLabel(plainText(r.agreeToTerms), { exact: true }),
      ).toHaveAttribute("id", "terms");
      // The accessible name of the checkbox is that sentence and nothing
      // more: no tag left as text (an apostrophe before a tag would do that),
      // and not the links' hint about the new tab, which is their description.
      await expect(
        form.getByRole("checkbox", {
          name: plainText(r.agreeToTerms),
          exact: true,
        }),
      ).toHaveAttribute("id", "terms");
      for (const document of ["terms", "privacy"]) {
        const link = form.getByRole("link", {
          name: taggedText(r.agreeToTerms, document),
          exact: true,
        });
        await expect(link).toHaveAttribute("href", `/${locale}/${document}`);
        await expect(link).toHaveAccessibleDescription(r.opensInNewTab);
      }
      await expect(form.locator('button[type="submit"]')).toHaveText(
        r.createAccount,
      );
    });
  }
});
