/**
 * @jest-environment node
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";

// Source pin for Auth.js. The link gate (src/lib/auth/link-gate.ts), what it
// stores of an account, the refusal page (src/lib/auth/link-refusal.ts) and
// the address a Google sign-in returns to (the `redirect` callback of
// src/lib/auth-config.ts) rest on what a few files of the installed Auth.js
// do, and no test completes a Google sign-in, so part of that was READ in the
// source and not measured (SECURITY.md, "Linking Google needs the password";
// docs/TESTING.md, "Account linking" and "Return address"). This test says
// nothing about behaviour. It makes the reading due again: it fails when one
// of those files is not the file that was read, which an upgrade of the
// pinned beta would otherwise pass unnoticed.
//
// When it fails: read the changed files again, for what each entry below
// says it is relied on for; correct the code or the documents if the answer
// changed; then record the new versions and hashes here.

const REPO_ROOT = path.resolve(__dirname, "../../../..");

// @auth/core is no dependency of this project: it is found beside next-auth,
// through next-auth's real path under node_modules/.pnpm.
const NEXT_AUTH = fs.realpathSync(
  path.join(REPO_ROOT, "node_modules", "next-auth"),
);
const PACKAGES: Record<string, { directory: string; version: string }> = {
  "next-auth": { directory: NEXT_AUTH, version: "5.0.0-beta.32" },
  "@auth/core": {
    directory: fs.realpathSync(path.join(NEXT_AUTH, "..", "@auth", "core")),
    version: "0.41.3",
  },
  "@auth/prisma-adapter": {
    directory: fs.realpathSync(
      path.join(REPO_ROOT, "node_modules", "@auth", "prisma-adapter"),
    ),
    version: "2.11.3",
  },
};

const PINNED: {
  package: string;
  file: string;
  sha256: string;
  reliedOnFor: string;
}[] = [
  {
    package: "@auth/core",
    file: "lib/actions/callback/handle-login.js",
    sha256: "299b06eb31f7e45f14ad4cfae4e9454e6849ead09583484f94e8bd95a471c4e7",
    reliedOnFor:
      "adapter.linkAccount is the only writer of Account rows; a new user is " +
      "created with emailVerified null and linked right after; Auth.js's own " +
      "refusals (OAuthAccountNotLinked) come before linkAccount; a stored " +
      "account is looked up through getUserByAccount only, for its user",
  },
  {
    package: "@auth/core",
    file: "lib/actions/callback/index.js",
    sha256: "b7a6919639300254d84124e30421c3ef312f77ba54c2a4e3c954561e3fe14c5e",
    reliedOnFor:
      "the signIn callback runs before handleLoginOrRegister; the jwt " +
      "callback, the session cookie and the signIn event come after it, so " +
      "an error thrown by linkAccount stops all three; the jwt callback is " +
      "handed the account of the provider's answer, not the stored row; an " +
      "accepted sign-in is answered with a redirect to options.callbackUrl",
  },
  {
    package: "@auth/core",
    file: "lib/init.js",
    sha256: "45a08cee278050cf25e4b8af2d9414da97ecffdc0c2b522f8fa1374fb271fa94",
    reliedOnFor:
      "the adapter is wrapped key by key (Object.keys), and an error of an " +
      "adapter method is logged and thrown again as AdapterError; every " +
      "request sets options.callbackUrl through createCallbackUrl and keeps " +
      "the answer in the callback-url cookie",
  },
  {
    package: "@auth/core",
    file: "lib/utils/callback-url.js",
    sha256: "268a164c3a8e138f58992df9bbc0d8a24d6418eed95b877acf740e75a63e236d",
    reliedOnFor:
      "the redirect callback is asked with the callbackUrl of the request, " +
      "or else with the callback-url cookie (the return from Google), and " +
      "with the origin of the request as baseUrl; its answer is used as it is",
  },
  {
    package: "@auth/core",
    file: "lib/index.js",
    sha256: "ad21a043d67dec068b731407dcec3c492c80e0d0e9fb9ce0eeb4de4898d07b09",
    reliedOnFor:
      "the OAuth callback also runs on POST, where the CSRF token is " +
      "checked for the credentials provider only",
  },
  {
    package: "@auth/core",
    file: "index.js",
    sha256: "92b58f370424c53b2b4d75b2c70ef6d50f6aaff6bfc407eaf031a462f4f9b9cf",
    reliedOnFor:
      "an error that is not client-safe is logged and answered with a " +
      "redirect to pages.error with error=Configuration, without cookies",
  },
  {
    package: "@auth/core",
    file: "errors.js",
    sha256: "5bbf15f3c7c59e6e62397474c133851e6048524eb0dcab6e87d71f44bce26fb4",
    reliedOnFor:
      "AdapterError is not in the client-safe set; OAuthAccountNotLinked " +
      "is, and it is a sign-in error (redirect to pages.signIn)",
  },
  {
    package: "@auth/core",
    file: "lib/utils/providers.js",
    sha256: "683035bd8ead4bafe98b58e20442e4e4f59262aaffa4d77cb9cf5f9233356f85",
    reliedOnFor:
      "which values of Google's token response reach linkAccount " +
      "(access_token, id_token, refresh_token and four more)",
  },
  {
    package: "@auth/prisma-adapter",
    file: "index.js",
    sha256: "87fccb0f032aa60cfadba19c527f169704af4b5d917637b0634c330d4c48953e",
    reliedOnFor:
      "createUser writes what it is given (no password, no Account row); " +
      "linkAccount stores the account it is handed as it comes; " +
      "getUserByAccount returns the user of an Account row and nothing of " +
      "the row; no method uses `this`",
  },
  {
    package: "next-auth",
    file: "index.js",
    sha256: "eb83d53903c977b9aa5800c6e3665e6e64dee4ad7b51625cf760dd0ed1d18dc1",
    reliedOnFor:
      "handlers.GET and handlers.POST are (request) => Auth(request, " +
      "config): the Response the refusal wrapper sees is the one Auth returns",
  },
  {
    package: "next-auth",
    file: "react.js",
    sha256: "905278113298170e6c76460d3e2e95c18eb8e4eb3be408ad9a3a933f54065304",
    reliedOnFor:
      "signIn() and signOut() post the callbackUrl they are given (the " +
      "address of the page when there is none); a call that redirects " +
      "sends the browser to the `url` of the answer, and a signIn() that " +
      "does not takes `error` and `code` from the query string of that `url`",
  },
];

const REREAD =
  "Auth.js is not the Auth.js that was read. Before trusting the link gate, " +
  "what it stores and the address a sign-in returns to, read the files " +
  "below again (SECURITY.md, 'Linking Google needs the password'; " +
  "docs/TESTING.md, 'Account linking' and 'Return address'), then record " +
  "the new versions and hashes in " +
  "src/test/unit/__tests__/authjs-source-pin.test.ts.";

/** The changes between what is installed and what is recorded: none when they agree. */
function changes(packages: typeof PACKAGES, pinned: typeof PINNED): string[] {
  const versions = Object.entries(packages).flatMap(
    ([name, { directory, version }]) => {
      const installed: string = JSON.parse(
        fs.readFileSync(path.join(directory, "package.json"), "utf8"),
      ).version;
      return installed === version
        ? []
        : [`${name}: version ${installed} is installed, ${version} was read`];
    },
  );
  const files = pinned.flatMap((pin) => {
    const file = path.join(packages[pin.package].directory, pin.file);
    const sha256 = crypto
      .createHash("sha256")
      .update(fs.readFileSync(file))
      .digest("hex");
    return sha256 === pin.sha256
      ? []
      : [
          `${pin.package}/${pin.file} changed; relied on for: ${pin.reliedOnFor}`,
        ];
  });
  return [...versions, ...files];
}

it("the Auth.js packages are the versions that were read, and the files that were read are unchanged", () => {
  const found = changes(PACKAGES, PINNED);

  if (found.length > 0) {
    throw new Error([REREAD, ...found.map((line) => `  - ${line}`)].join("\n"));
  }
});

// A check that finds nothing in files it cannot read would pass: the same
// check with one recorded version and one recorded hash changed.
it("the check reports a version and a file that differ from the record", () => {
  const otherVersion = {
    ...PACKAGES,
    "@auth/core": { ...PACKAGES["@auth/core"], version: "0.41.2" },
  };
  const otherHash = PINNED.map((pin) =>
    pin.file === "lib/init.js" ? { ...pin, sha256: "0".repeat(64) } : pin,
  );

  expect(changes(otherVersion, otherHash)).toEqual([
    "@auth/core: version 0.41.3 is installed, 0.41.2 was read",
    expect.stringMatching(
      /^@auth\/core\/lib\/init\.js changed; relied on for: /,
    ),
  ]);
});

it("every pinned file says what it is relied on for, and belongs to a pinned package", () => {
  expect(PINNED.length).toBeGreaterThan(0);
  for (const pin of PINNED) {
    expect(Object.keys(PACKAGES)).toContain(pin.package);
    expect(pin.reliedOnFor.trim()).not.toBe("");
    expect(pin.sha256).toMatch(/^[0-9a-f]{64}$/);
  }
});
