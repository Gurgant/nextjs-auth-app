/**
 * The language selector leads to the page the visitor is on, under the chosen
 * locale: only the locale segment of the path changes, and the query string
 * and the fragment stay. The router and the pathname are mocks;
 * useTranslations (mocked in jest.setup.js) returns the message key, so the
 * option of a locale reads "<locale>.nativeName".
 */
import fs from "fs";
import path from "path";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Locale } from "@/config/i18n";

const mockPush = jest.fn();
let mockPathname = "/en";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

import { LanguageSelector } from "../language-selector";

const LOCALES: readonly Locale[] = ["en", "es", "fr", "it", "de"];

// A page file, with each extension that Next takes as one by default
// (next.config.ts sets no pageExtensions).
const PAGE_FILE = /^page\.(?:tsx?|jsx?)$/;

/**
 * The address of every page under src/app/[locale], below the locale: "" for
 * the home page, and a dynamic segment filled in ("[token]" as "some-token").
 */
function pagePaths(): string[] {
  const root = path.resolve(__dirname, "../../app/[locale]");
  const below = (dir: string, route: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.isDirectory()) {
        return below(path.join(dir, entry.name), `${route}/${entry.name}`);
      }
      return PAGE_FILE.test(entry.name) ? [route] : [];
    });
  return below(root, "")
    .map((route) => route.replace(/\[(\w+)\]/g, "some-$1"))
    .sort();
}

/**
 * Renders the selector of a page shown in `from`, chooses `to`, and returns
 * the arguments of every router.push().
 */
function chooseLanguage(from: Locale, to: Locale): unknown[][] {
  const { unmount } = render(<LanguageSelector locale={from} />);
  fireEvent.click(screen.getByRole("button", { name: /^Current language/ }));
  fireEvent.click(
    screen.getByRole("option", { name: new RegExp(`${to}\\.nativeName`) }),
  );
  unmount();
  return mockPush.mock.calls;
}

/** The same on `address`: a path with its query string and its fragment. */
function chooseLanguageOn(address: string, from: Locale, to: Locale) {
  window.history.replaceState(null, "", address);
  // What usePathname() gives in the browser: the path without the rest.
  mockPathname = window.location.pathname;
  return chooseLanguage(from, to);
}

describe("LanguageSelector", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  const pages = pagePaths();

  it("finds the pages under src/app/[locale]", () => {
    expect(pages).toEqual(
      expect.arrayContaining([
        "",
        "/register",
        "/auth/error",
        "/verify-email/some-token",
      ]),
    );
  });

  it.each(pages.map((page) => [page || "/", page]))(
    "on %s, leads to the same page under the chosen locale",
    (_name, page) => {
      expect(chooseLanguageOn(`/en${page}`, "en", "fr")).toEqual([
        [`/fr${page}`],
      ]);
    },
  );

  it("keeps the query string and the fragment as they are", () => {
    const rest = "?error=OAuthAccountNotLinked&next=%2Fen%2Faccount#help";

    expect(chooseLanguageOn(`/en/auth/error${rest}`, "en", "de")).toEqual([
      [`/de/auth/error${rest}`],
    ]);
  });

  it("leads from each locale to each of the others", () => {
    for (const from of LOCALES) {
      for (const to of LOCALES.filter((locale) => locale !== from)) {
        mockPush.mockClear();

        expect(chooseLanguageOn(`/${from}/account`, from, to)).toEqual([
          [`/${to}/account`],
        ]);
      }
    }
  });

  // usePathname() gives the path of the address the visitor is on: it starts
  // with "/" and a browser has resolved its dot segments, so most of these
  // cannot come from it. Whatever the path is, the selector does not leave
  // this origin and lands under the chosen locale.
  it.each([
    "//evil.example",
    "//evil.example/en",
    "/en//evil.example",
    "/\\evil.example",
    "/en/\\evil.example",
    "https://evil.example/en",
    "javascript:alert(1)",
    "en",
    "",
    "/en/./admin",
    "/en/a/../b",
    "/en/../fr/admin",
    "/en/..",
    "/en/../admin",
    "/en/../frx",
    "/en/a/../../admin",
    "/en/..//evil.example",
    "/en/%2e%2e/admin",
    "/en/.%2E/admin",
    "/en/..\\admin",
    "/en/.\t./admin",
    "/../admin",
  ])("stays on this origin and under the chosen locale for %j", (pathname) => {
    mockPathname = pathname;

    const calls = chooseLanguage("en", "fr");

    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(1);
    const target = new URL(String(calls[0][0]), "https://app.example");
    expect(target.origin).toBe("https://app.example");
    expect(`${target.pathname}/`.startsWith("/fr/")).toBe(true);
  });

  it("leads to the home page of the chosen locale, query string and fragment kept, when dot segments would lead out of the locale", () => {
    window.history.replaceState(null, "", "/en/account?tab=2#part");
    mockPathname = "/en/../admin";

    expect(chooseLanguage("en", "fr")).toEqual([["/fr?tab=2#part"]]);
  });
});
