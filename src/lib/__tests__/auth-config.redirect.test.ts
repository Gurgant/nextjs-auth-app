/**
 * @jest-environment node
 */

/**
 * The `redirect` callback of the Auth.js configuration: the address the
 * browser is sent to after a sign-in, a link or a sign-out. Auth.js asks it
 * with the `callbackUrl` of the request, or with the one it kept in its
 * callback-url cookie, and with its own origin as `baseUrl` (read in
 * @auth/core 0.41.3, lib/utils/callback-url.js).
 *
 * The rule: an address on this origin is kept as it was asked for, in every
 * language, unless it carries a user name or a password; anything else
 * becomes the base URL. The callback is called here
 * as a function. What a browser shows of it is in
 * e2e/tests/return-address.e2e.ts; a Google sign-in is completed by no test.
 */

jest.mock("next-auth", () => {
  class CredentialsSignin extends Error {
    code = "credentials";
  }
  return { __esModule: true, CredentialsSignin };
});
jest.mock("next-auth/providers/credentials", () => ({
  __esModule: true,
  default: (options: unknown) => ({ id: "credentials", options }),
}));
jest.mock("next-auth/providers/google", () => ({
  __esModule: true,
  default: (options: unknown) => ({ id: "google", options }),
}));
jest.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { authOptions } from "@/lib/auth-config";

const BASE = "https://app.example";
// The origin of `next dev`: one with a port.
const DEV_BASE = "http://localhost:3000";

const sentTo = (url: string, baseUrl = BASE) =>
  authOptions.callbacks.redirect({ url, baseUrl });

describe("an address on this origin is kept as it was asked for", () => {
  it.each([
    ["the home page of a locale", "/en", `${BASE}/en`],
    // Up to 2.5.0 every address that contained "/en" became the English home.
    ["the English account page", "/en/account", `${BASE}/en/account`],
    [
      "a page below a locale",
      "/en/dashboard/user",
      `${BASE}/en/dashboard/user`,
    ],
    [
      "a query string and a fragment",
      "/es/account?tab=security&from=%2Fes#password",
      `${BASE}/es/account?tab=security&from=%2Fes#password`,
    ],
    // Up to 2.5.0 these two became the English home, in every language.
    [
      "an address that contains /auth/signin",
      "/fr/auth/signin?error=OAuthAccountNotLinked",
      `${BASE}/fr/auth/signin?error=OAuthAccountNotLinked`,
    ],
    [
      "an address that contains /signout",
      "/it/account?after=/signout",
      `${BASE}/it/account?after=/signout`,
    ],
    [
      "an absolute URL of this origin",
      `${BASE}/de/dashboard/pro`,
      `${BASE}/de/dashboard/pro`,
    ],
    [
      "an absolute URL of this origin with a query string and a fragment",
      `${BASE}/it/account?tab=security#password`,
      `${BASE}/it/account?tab=security#password`,
    ],
    ["the base URL itself", BASE, `${BASE}/`],
    [
      "a path on an origin with a port",
      "/en/account",
      `${DEV_BASE}/en/account`,
      DEV_BASE,
    ],
    [
      "an absolute URL of an origin with a port",
      `${DEV_BASE}/es/account`,
      `${DEV_BASE}/es/account`,
      DEV_BASE,
    ],
  ])("%s", async (_, asked, expected, baseUrl = BASE) => {
    await expect(sentTo(asked, baseUrl)).resolves.toBe(expected);
  });
});

// What the application asks for: the account page after "Sign in with Google"
// and after linking Google, the home page after a sign-out, and the page the
// e-mail form is on (next-auth sends `window.location.href` when the caller
// names no address).
describe.each(["en", "es", "fr", "it", "de"])(
  "in every language alike: %s",
  (locale) => {
    it.each([
      [`/${locale}/account`, `${BASE}/${locale}/account`],
      [`/${locale}`, `${BASE}/${locale}`],
      [`${BASE}/${locale}`, `${BASE}/${locale}`],
    ])("%s", async (asked, expected) => {
      await expect(sentTo(asked)).resolves.toBe(expected);
    });
  },
);

describe("anything else becomes the base URL", () => {
  it.each([
    ["another origin", "https://evil.test/account"],
    [
      "an origin that only starts with the base URL",
      "https://app.example.evil.test/account",
    ],
    [
      "the base URL as the user name of another host",
      "https://app.example@evil.test/account",
    ],
    [
      "the base URL as user name and password of another host",
      "https://app.example:443@evil.test/account",
    ],
    [
      "another host with the base URL behind a backslash and an @",
      "https://evil.test\\@app.example/account",
    ],
    ["a protocol-relative address", "//evil.test/account"],
    ["two backslashes for the two slashes", "\\\\evil.test/account"],
    ["a slash and a backslash", "/\\evil.test/account"],
    ["a backslash and a slash", "\\/evil.test/account"],
    ["backslashes after the scheme", "https:\\\\evil.test/account"],
    ["a tab between the two slashes", "/\t/evil.test/account"],
    ["a line break between the two slashes", "/\n/evil.test/account"],
    ["white space before a protocol-relative address", " //evil.test/account"],
    ["javascript:", "javascript:alert(document.domain)"],
    ["data:", "data:text/html,<script>alert(document.domain)</script>"],
    // Its `origin` is the one of the address inside it: this origin.
    ["blob: with an address of this origin", "blob:https://app.example/1b2c"],
    ["the same host under another scheme", "http://app.example/account"],
    ["the same host on another port", "https://app.example:8443/account"],
    ["another scheme without slashes", "http:evil.test/account"],
    ["what no URL parser accepts", "https://[evil.test/account"],
    // The host is this one, and what stands before the @ is a user name and
    // a password for it. Not another origin, and not an address the
    // application asks for: see the callback.
    [
      "this origin with a user name and a password",
      "https://user:pw@app.example/account",
    ],
    [
      "this origin with another host as its user name",
      "https://evil.test@app.example/account",
    ],
    [
      "this origin with a password and no user name",
      "https://:pw@app.example/account",
    ],
  ])("%s", async (_, asked) => {
    await expect(sentTo(asked)).resolves.toBe(BASE);
  });

  it.each([
    [
      "a port that only starts with the port of the base URL",
      "http://localhost:30000/account",
    ],
    [
      "the base URL as the user name of another host",
      "http://localhost:3000@evil.test/account",
    ],
    [
      "the base URL as the start of another host name",
      "http://localhost:3000.evil.test/account",
    ],
    [
      "this origin with a user name and a password",
      "http://user:pw@localhost:3000/en",
    ],
  ])("with a base URL that has a port: %s", async (_, asked) => {
    await expect(sentTo(asked, DEV_BASE)).resolves.toBe(DEV_BASE);
  });
});

describe("the answer is the address as the URL parser resolved it, never the text that was sent", () => {
  it("a path without its leading slash is a path below the root", async () => {
    await expect(sentTo("es/account")).resolves.toBe(`${BASE}/es/account`);
  });

  it("dot segments are resolved", async () => {
    await expect(sentTo("/en/account/../../admin")).resolves.toBe(
      `${BASE}/admin`,
    );
  });

  // A parser reads the scheme of the base URL without slashes as a relative
  // path: the answer is that path on this origin, and "evil.test" is a
  // directory name in it.
  it("the scheme of the base URL without slashes is a relative path", async () => {
    await expect(sentTo("https:evil.test/account")).resolves.toBe(
      `${BASE}/evil.test/account`,
    );
  });
});
