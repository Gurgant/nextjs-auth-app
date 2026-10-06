import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  expectSignedOut,
  plainText,
  taggedText,
  waitForSignedOutHome,
} from "../support/app";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";
import italian from "../../messages/it.json";
import de from "../../messages/de.json";

/*
 * /{locale}/terms and /{locale}/privacy: the two pages that the terms
 * sentence of the registration form links to
 * (src/components/auth/registration-form.tsx). Both hold placeholder text of
 * the starter kit and say so; whoever operates the application replaces them
 * (README, "Scope and limits").
 *
 * The form's links open a new tab, so that what was typed into the form
 * stays, and a click on a link is no click on the checkbox it stands beside.
 * The page says so to whoever came from the form (it is still open in the
 * other tab); its one link leads to the registration page, for a visitor who
 * opened the page directly, and is not called a way back.
 *
 * No form is sent and nobody signs in: this file spends no rate-limit budget.
 */

// The files next-intl serves (src/i18n.ts), by locale.
const MESSAGES = { en, es, fr, it: italian, de };
type Locale = keyof typeof MESSAGES;
const LOCALES = Object.keys(MESSAGES) as Locale[];

const DOCUMENTS = ["terms", "privacy"] as const;
type LegalDocument = (typeof DOCUMENTS)[number];

// What the visitor has typed when the links are followed. Never sent.
const TYPED = {
  name: "Typed Before Reading",
  email: "typed-before-reading@example.com",
  password: "Typed-Passw0rd!",
};

/** The page of `document` under `locale`, with its notice (the nav has an <h1> of its own). */
async function expectPlaceholderPage(
  page: Page,
  locale: Locale,
  document: LegalDocument,
) {
  const legal = MESSAGES[locale].Legal;
  await expect(page).toHaveURL(new RegExp(`/${locale}/${document}$`));
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  const main = page.locator("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(
    legal[document].title,
  );
  const notice = main.getByRole("note");
  await expect(notice).toContainText(legal.placeholderTitle);
  await expect(notice).toContainText(legal.placeholderNotice);
  await expect(
    main.getByText(legal.stillOpenInOtherTab, { exact: true }),
  ).toBeVisible();
}

/** Clicks `link` and returns the tab that the click opens. */
async function openInNewTab(page: Page, link: Locator): Promise<Page> {
  const opened = page.context().waitForEvent("page");
  await link.click();
  const tab = await opened;
  await tab.waitForLoadState();
  return tab;
}

// English and one other locale: the links carry the locale of the form.
for (const locale of ["en", "de"] as const) {
  test(`/${locale}/register: each link of the terms sentence opens its page in a new tab; the form keeps what was typed and the checkbox stays as it was`, async ({
    page,
  }) => {
    const m = MESSAGES[locale];
    const registerUrl = new RegExp(`/${locale}/register$`);
    // Reached through the hydrated home page, as in auth-registration.e2e.ts:
    // the form is then rendered with React attached, and the checkbox reacts
    // to the first click.
    await page.goto(`/${locale}`);
    await waitForSignedOutHome(page);
    await page
      .locator("main")
      .getByRole("link", { name: m.Auth.registerHere, exact: true })
      .click();
    await expect(page).toHaveURL(registerUrl, { timeout: 20_000 });

    const form = page.locator("main form");
    const sentence = m.Registration.agreeToTerms;
    // The name of the checkbox is the sentence as text, links included.
    const checkbox = form.getByRole("checkbox", {
      name: plainText(sentence),
      exact: true,
    });
    const submit = form.locator('button[type="submit"]');
    const link = (document: LegalDocument) =>
      form.getByRole("link", {
        name: taggedText(sentence, document),
        exact: true,
      });
    const typed = async () => ({
      name: await form.locator("input#name").inputValue(),
      email: await form.locator("input#email").inputValue(),
      password: await form.locator("input#password").inputValue(),
    });

    await form.locator("input#name").fill(TYPED.name);
    await form.locator("input#email").fill(TYPED.email);
    await form.locator("input#password").fill(TYPED.password);
    await expect(checkbox).not.toBeChecked();
    await expect(submit).toBeDisabled();
    // Each link says in its description that it opens a new tab: the name of
    // the checkbox above is still the sentence alone.
    for (const document of DOCUMENTS) {
      await expect(link(document)).toHaveAccessibleDescription(
        m.Registration.opensInNewTab,
      );
    }

    // Unticked: the link to the terms.
    const terms = await openInNewTab(page, link("terms"));
    await expectPlaceholderPage(terms, locale, "terms");
    // rel="noopener": the new tab has no handle on the form's tab.
    expect(await terms.evaluate(() => window.opener === null)).toBe(true);
    expect(page.context().pages()).toHaveLength(2);
    await terms.close();

    await expect(page).toHaveURL(registerUrl);
    await expect(checkbox).not.toBeChecked();
    await expect(submit).toBeDisabled();
    expect(await typed()).toEqual(TYPED);

    // Ticked: the link to the privacy policy.
    await checkbox.check();
    await expect(submit).toBeEnabled();
    const privacy = await openInNewTab(page, link("privacy"));
    await expectPlaceholderPage(privacy, locale, "privacy");
    expect(await privacy.evaluate(() => window.opener === null)).toBe(true);
    await privacy.close();

    await expect(page).toHaveURL(registerUrl);
    await expect(checkbox).toBeChecked();
    await expect(submit).toBeEnabled();
    expect(await typed()).toEqual(TYPED);
  });
}

for (const document of DOCUMENTS) {
  test(`/{locale}/${document} is served to a visitor without a session in the five locales: it says that it is placeholder text, outlines what such a document covers and links to the registration page`, async ({
    page,
  }) => {
    await expectSignedOut(page);

    for (const locale of LOCALES) {
      const legal = MESSAGES[locale].Legal;
      const response = await page.goto(`/${locale}/${document}`);
      // Served as it is: no redirect to a sign-in page.
      expect(response?.status()).toBe(200);
      expect(response?.request().redirectedFrom()).toBeNull();

      await expectPlaceholderPage(page, locale, document);
      // The pattern of the verification page: "… - Auth App".
      await expect(page).toHaveTitle(
        `${legal[document].title} - ${MESSAGES[locale].Layout.appTitle}`,
      );
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        "content",
        legal.placeholderNotice,
      );
      const main = page.locator("main");
      await expect(main.getByRole("heading", { level: 2 })).toHaveText(
        legal.outlineHeading,
      );
      await expect(main.getByRole("listitem")).toHaveText(
        Object.values(legal[document].outline),
      );
      await expect(main.getByRole("link")).toHaveCount(1);
      await expect(
        main.getByRole("link", {
          name: legal.goToRegistration,
          exact: true,
        }),
      ).toHaveAttribute("href", `/${locale}/register`);
    }
    await expectSignedOut(page);

    // The link, followed from the last page by this visitor, who came
    // directly and has no form open elsewhere: the registration page.
    const last = LOCALES[LOCALES.length - 1];
    await page
      .locator("main")
      .getByRole("link", {
        name: MESSAGES[last].Legal.goToRegistration,
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${last}/register$`));
    await expect(
      page.locator("main").getByRole("heading", { level: 1 }),
    ).toHaveText(MESSAGES[last].Registration.title);
  });
}

// The name of a document is one long word in German ("Nutzungsbedingungen",
// "Datenschutzerklärung"). The heading is painted as a gradient clipped to
// its text, so a word wider than the heading would not stick out: it would
// be cut off without a trace.
test.describe("on a phone", () => {
  // The width of a common phone, and the narrowest one still in use.
  const WIDTHS = [390, 320];

  for (const document of DOCUMENTS) {
    test(`/{locale}/${document}: the heading shows the whole name of the document in the five locales, and the page does not scroll sideways`, async ({
      page,
    }) => {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 844 });
        for (const locale of LOCALES) {
          await page.goto(`/${locale}/${document}`);
          const heading = page
            .locator("main")
            .getByRole("heading", { level: 1 });
          await expect(heading).toHaveText(
            MESSAGES[locale].Legal[document].title,
          );

          const measured = await heading.evaluate((element) => ({
            needed: element.scrollWidth,
            given: element.clientWidth,
            pageNeeded: window.document.documentElement.scrollWidth,
            pageGiven: window.document.documentElement.clientWidth,
          }));
          const where = `/${locale}/${document} at ${width} px`;
          expect(measured.given, where).toBeGreaterThan(0);
          expect(measured.needed, `heading of ${where}`).toBeLessThanOrEqual(
            measured.given,
          );
          expect(measured.pageNeeded, `page ${where}`).toBeLessThanOrEqual(
            measured.pageGiven,
          );
        }
      }
    });
  }
});
