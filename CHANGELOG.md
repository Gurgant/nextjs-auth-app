# Changelog

## [v2.5.3] - 2026-10-07

Two security fixes around two-factor sign-in and the e-mails, a backup code
can be entered at sign-in, and every text of the five languages was read
again. The database schema does not change, and no dependency changes.

### 🔒 Security

- **After a change of `ENCRYPTION_KEY`, the second factor could be passed
  without the user's authenticator.** The kit has no key rotation: a new key
  reads most stored 2FA secrets and backup codes as the empty text (measured
  outside the suite: 1754 of 2000 secrets, 1882 of 2000 backup codes). Up to
  2.5.2, on a deployment whose key had been changed after users enabled 2FA,
  someone who knew the password of such a user could then sign in:
  - with the six digits that TOTP gives for the empty secret, which anyone
    can compute, typed into the sign-in form (measured in a browser with
    the old check: it reached the account page; the old function accepted
    them for 1759 of 2000 secrets written with another key);
  - with `-` as `backupCode` in a hand-made request to the credentials
    endpoint (the old function accepted it for 200 of 200 users whose eight
    codes were written with another key).
    `validateTOTPCode` now checks a code only against a whole secret (base32,
    sixteen characters or more), and `validateBackupCode` compares only a whole
    code (eight letters and digits) with a whole stored code: in the same
    measurement they accepted neither, for no secret and no user. Such a user
    is answered as with a wrong code, and the attempt is counted, until an
    operator clears the 2FA columns (`docs/DEPLOYMENT.md`). `authorize()` is
    unchanged. Tested by unit tests of the two functions and of `authorize()`,
    and in a browser by `e2e/tests/two-factor-key-change.e2e.ts`. A deployment
    that never changed the key was not affected.
- **The e-mails wrote the user's name as it was typed.** A name may be any 2
  to 100 characters, and the action that sends the verification e-mail needs
  no session, so a mail of the site could be sent to another person's
  address with markup of the sender's choosing in its HTML part, or with
  lines of its own in the text part ("Your account is blocked. Open
  https://…"). The name, the verification link and the sentence of the
  security alert are now escaped where they go into HTML (`&`, `<`, `>`,
  `"`, `'`), and every run of white space and control characters in the
  name is one space. Zero-width and direction characters in a name are not
  removed. Tested with hostile names in both parts, five languages.

### 🔧 Changed

- **A backup code can be entered at sign-in.** The server has accepted one
  for a long time; the form had no field for it, while the downloaded file
  told the user to use the codes. After the password, the 2FA step now
  offers "Use a backup code instead". A code works once; a wrong one is
  answered like a wrong authenticator code and counts toward the same
  throttle and lockout. Measured in a browser against the real server and
  database: a code signs in, the account page shows one code fewer, the same
  code is refused the second time. New backup codes still come only from
  disabling 2FA and enabling it again.
- **Every text of the five languages was read again**, by one editor per
  language, and 599 of the 1465 texts of 2.5.2 changed: English 16, Italian
  139, Spanish 178, French 159, German 107. Errors (a wrong word, gender or
  agreement; a sentence in the formal address among informal ones; a German
  warning that said "rest assured"), word-for-word English ("please try
  again", "failed to …", "instead" at the end of a sentence), English-style
  capitals in titles and buttons, French spaces before `?` `!` `:` `;`,
  and one term for one thing in each file. The conventions that were
  applied are in `CONTRIBUTING.md`, "Conventions of each language".
- **The 2FA step of the sign-in form, the two notes of the 2FA set-up and
  the downloaded backup-codes file are translated.** They were English under
  every locale. The file no longer tells the user to generate new codes
  (nothing does that) and says how new ones come about, says "each code can
  only be used once" once, carries its date in the language of the page,
  and names where a code is entered.
- **The verification e-mail**: 18 texts corrected in the five languages; its
  header names the application as the pages of that language do; without a
  name it greets with the salutation alone ("Hello,", was "Hello there,";
  "Ciao,", was "Ciao utente,"); in the text part the link stands on a line
  of its own. The security-alert e-mail is still English for every reader
  (`README.md`, Scope and limits).
- **"Contact support" is "the administrator of this site"**, in the three
  texts of the pages and in the alert e-mail: the kit has no support team.
- **The application's name**: "Anmelde-App" in German (was the English
  "Auth App") and "App di accesso" in Italian (was "App di Autenticazione",
  the words the same pages use for the authenticator app).
- Smaller corrections: the account page says "your Google account" (it
  showed the provider's id in lower case); on the page that confirms an
  e-mail address the link "Go to Dashboard" leads to the dashboard (it led
  to the account page, like the link under it); the line that counts the
  backup codes reads "Backup codes available: 1" (was "1 backup codes
  available"); the account page has a title and a description in the
  language of its address; the user dashboard says "Unverified", as the
  account page does; the title of the home page no longer ends with one
  word alone on its last line (five locales, measured at 1280 and 390 px;
  at 320 px the French one still does).
- **Screenshots**: the Italian home page, the 2FA step of the sign-in form
  and the 2FA part of the account page were taken again.

### ⬆️ Upgrading from v2.5.2

- Nothing to push and nothing to install.
- **If you ever changed `ENCRYPTION_KEY`**: users who had enabled 2FA
  before the change can no longer sign in with e-mail and password until
  their `twoFactorEnabled`, `twoFactorSecret` and `backupCodes` columns are
  cleared (`docs/DEPLOYMENT.md`). Up to 2.5.2 the same users were exposed as
  described under Security.
- A fork that stores a TOTP secret in another form than the kit writes
  (shorter than sixteen base32 characters, with padding, or in groups
  separated by spaces): `validateTOTPCode` now refuses it. The kit writes
  sixteen base32 characters (20000 of 20000 generated secrets, measured),
  with the function and the `otplib` range it has had since v2.0.0.
- **Message files.** A locale file of your own adds 19 keys (8 under
  `CredentialsForm`, 11 under `TwoFactorSetup`) and may want to follow the
  16 English texts that changed. Two new unit tests read the message files:
  `rich-messages.real-formatter.test.ts` fails when a text does not have the
  arguments and tags of the English text of its key, or when the installed
  next-intl cannot format it; `message-conventions.test.ts` holds 37
  searches for wordings the editors removed from the five languages (for
  example "Per favore", "Por favor", "Échec de", a French `?` without its
  no-break space). It is a list of narrow searches, not a proof-reader; a
  text of your own that one of them catches is reworded, or the search is
  narrowed with that text as a fixture.
- Tests of your own that compare a changed text, or that wait for
  "Invalid or expired code. Please try again." after a wrong 2FA code: the
  form answers "Invalid code. Please try again." now, for both kinds of
  code, in the language of the page.

### 🧪 Tests

- Jest: 2102 tests (was 1767): 2049 without a database (was 1714) and 53 in
  the integration file (unchanged). Playwright: 122 tests in 15 spec files
  (was 117 in 13), counted with `playwright test --list`.
- Coverage: 83 % of statements (was 80 %); three runs gave 83.67 % each.
- Message keys per locale: 312 (was 293).
- The whole Playwright suite was run on the code of this release, before
  the release texts were edited: 122 passed, exit code 0, no "Compiled"
  line of the dev server after the first test.
- The change went through three rounds of independent review; the two
  findings under Security came from them. The figures quoted there for the
  old and the new functions were measured again for this release, in one
  run, with a right code under the right key as the case that must pass.

## [v2.5.2] - 2026-10-06

The texts and pages a visitor meets first. The database schema does not
change, and no dependency changes.

### 🔧 Changed

- **The line under the title of the home page says how to sign in.** Where
  Google sign-in is configured it reads "Sign in with Google, or with e-mail
  and password"; where it is not, "Sign in with e-mail and password" (five
  languages). It read "Simple authentication with Google OAuth" in both
  cases, also where the page had no Google button. The layout's default
  meta description, for the pages that set none themselves, follows the
  same rule.
- **The home page no longer waits to learn whether Google is configured.**
  The layout hands the answer to the page
  (`src/components/auth/google-sign-in-provider.tsx`), and
  `useGoogleSignInEnabled()` asks `/api/auth/providers` only where no such
  provider is above it. The sentence and the sign-in entry are in the first
  HTML. Measured in Chromium, five locales at two widths, the first HTML
  against the settled page: without Google the card grew from 312 to 384 px
  at 1280 px and everything under the title moved; now nothing moves. With
  placeholder Google keys the title and the card move by 0 or 1 px. The
  value follows the running server, not the build (measured with one build
  served with and without the keys).
- **Terms of Service and Privacy Policy have a page each.** The required
  checkbox of the registration form named two documents that did not exist.
  `/{locale}/terms` and `/{locale}/privacy` are new, in five languages,
  and both are **placeholders**: each says that it is sample text of the
  starter kit and not a legal document, and that whoever operates the
  application replaces it before going live. The two names in the label are
  links that open in a new tab; the form keeps what was typed and the
  checkbox is not toggled (measured in Chromium, and by keyboard).
- **User and PRO dashboard**: the link reads "Back to account". It read
  "← Back to Main Dashboard" next to an arrow icon, and led to the account
  page then as now.
- **Admin page**: the section with the one remaining link, "System Metrics",
  is called "Diagnostics" (was "Admin Actions").
- **Translations corrected.** German: "branchenüblicher Verschlüsselung"
  (the footer line was not correct German) and "Datenschutzerklärung" (was
  "Datenschutzrichtlinie"). French: "chiffrement" (was "cryptage") and
  "Conditions d'utilisation" (was "Conditions de Service"). Italian:
  "Informativa sulla Privacy" (was "Politica sulla Privacy"). Spanish: "y la
  Política de Privacidad" (the article was missing).
- **Screenshots**: the README's pictures of the home page, the sign-in
  form, the 2FA step, the registration form and the two dashboards were
  taken again; the user dashboard is shown whole.

### ⬆️ Upgrading from v2.5.1

- Nothing to push and nothing to install: `prisma/schema.prisma`,
  `package.json` dependencies and the lockfile are unchanged.
- **Before going live, replace the two placeholder pages**
  (`src/app/[locale]/terms`, `src/app/[locale]/privacy`, texts under
  `Legal` in `messages/`). The registration form checks the box in the
  browser only, as before, and stores no acceptance.
- A project with a locale file of its own adds 17 keys (15 under `Legal`,
  `Home.subtitleWithoutGoogle`, `Registration.opensInNewTab`) and writes
  `Registration.agreeToTerms` with the tags `<terms>` and `<privacy>`
  around the two names. An ASCII apostrophe directly before a tag makes the
  formatter swallow the tag (measured with the installed
  intl-messageformat); the Italian text uses the typographic one, and a unit
  test fails on the other.
- E2E tests of your own that took the Google button or the e-mail field as
  the sign that the home page had hydrated: both can now be in the first
  HTML. The helper `waitForSignedOutHome` waits for
  `data-session-status="unauthenticated"` on the signed-out home instead.

### 🧪 Tests

- Jest: 1767 tests (was 1598): 1714 without a database (was 1545) and 53 in
  the integration file (unchanged). Playwright: 117 tests in 13 spec files
  (was 105 in 12), counted with `playwright test --list`.
- Coverage: 80 % of statements (was 78 %); five runs gave 80.02 % four times
  and 80.09 % once.
- Message keys per locale: 293 (was 276). The E2E warm-up asks sixteen
  routes (was fourteen).
- The whole Playwright suite was run once on the code of this release,
  before one comment and the release texts were edited: 117 passed, exit
  code 0, no "Compiled" line of the dev server after the first test. The
  change went through an independent review: four major findings (two
  German titles cut off on a phone, the home page moving when it settled, a
  test that could not fail, a link that led to an empty form), all closed.

## [v2.5.1] - 2026-10-06

A security fix for the address the browser returns to after a sign-in,
Google's tokens are no longer stored, and `README.md` and `SECURITY.md` are
reordered. The database schema does not change.

### 🔒 Security

- **The return address could leave the origin: an open redirect.** After a
  sign-in, a link or a sign-out, Auth.js sends the browser to the address
  that the `redirect` callback answers. Up to 2.5.0 the callback compared
  text, and answered an address that begins with the base URL as it was
  sent: for `https://app.example` also `https://app.example.evil.test/…`,
  `https://app.example@evil.test/…` and `https://app.example:8443/…`.
  Measured with the code of 2.5.0 at the sign-out endpoint of the running
  Auth.js: asked for `http://localhost:3000@evil.test/account`, it answered
  with that address and kept it in its callback-url cookie.
  - **Who could have been affected.** No caller of the application passed
    such an address: each names a path under its locale, and the e-mail
    form names none (read in the source). Affected is a project built on
    the starter that hands `signIn()` or `signOut()` a `callbackUrl` a
    visitor controls, and Auth.js's own sign-out page, which the
    application serves at `/api/auth/signout`: it took the address from its
    query string, and the sign-out was answered with a redirect to it
    (measured). In Chromium the browser did not follow that redirect,
    because the Content-Security-Policy has `form-action 'self'`; no other
    browser was measured.
  - **Now** the callback parses the address against the base URL and keeps
    it only when its scheme, host and port are those of the base URL and it
    carries no user name or password. Anything else is answered with the
    base URL.
  - **Tested** by 56 unit cases that call the callback, and in the E2E
    suite: the running Auth.js is asked ten times to return to an address,
    five on the origin and five that are not, and its answer and its cookie
    are compared. The measurements on both versions and a mutation check
    are in `docs/TESTING.md`, "Return address".
- **Google's tokens are no longer stored.** Up to 2.5.0 the adapter stored
  a Google account as Auth.js handed it over: next to the four values that
  say whose account it is, what the token response carried, in plain text,
  in the seven token columns of the `Account` row (`access_token`,
  `refresh_token`, `id_token`, `expires_at`, `token_type`, `scope`,
  `session_state`). Nothing in the application read them. The link gate,
  through which Auth.js writes an `Account` row, now hands the adapter
  `userId`, `type`, `provider` and `providerAccountId` only, and the seven
  columns stay `NULL`.
  - Measured on real PostgreSQL by two tests of the integration file, for a
    first Google sign-in and for a link after the password step, each
    handed all seven values; with the code of 2.5.0 the same two tests
    found all seven in the row. A returning Google user whose row holds no
    token signs in (measured with Auth.js's decision function, not against
    Google). That Auth.js writes an `Account` row through `linkAccount` only
    and reads no stored token back was read in the source of `@auth/core`
    0.41.3 and `@auth/prisma-adapter` 2.11.3.
  - Rows written by earlier versions keep their tokens until the statement
    under "Upgrading from v2.5.0" is run. Google is still asked for a
    refresh token, which is no longer kept (`SECURITY.md`).
  - A project that needs the tokens, to call a Google API, returns the
    whole account from `identityOf` in `src/lib/auth/link-gate.ts`, and
    should encrypt them first.
- **`source-map-js` 1.2.2** (was 1.2.1), in the lockfile only, for the
  advisory GHSA-68fv-2mgg-jv7q (high): a crafted source map can make an
  earlier version block the event loop (read in the advisory). No file of
  the application imports the package; `postcss`, which Next depends on,
  and `@tailwindcss/node` bring it (`pnpm why source-map-js`).

### 🔧 Changed

- **After the two Google flows an English user returns to the account
  page.** "Sign in with Google" and the Google link of the account page ask
  for `/{locale}/account`. The old rule sent every address that contains
  `/en` to `/en`, so under English the browser came back to the home page,
  and under the four other languages to the account page. Measured: the
  callback as a function, and the running Auth.js, which answers
  `/en/account` with that address and keeps it in its callback-url cookie.
  That the browser is sent to the address of that cookie when Google
  returns was read in the source of `next-auth` 5.0.0-beta.32 and
  `@auth/core` 0.41.3, not measured: no test completes a Google sign-in.
- **Other answers of the `redirect` callback that changed.** The rule is
  now the same in every language.
  - The e-mail form on an English home address that carries `?error=`:
    after a sign-in the browser stays on that address, signed in, and no
    longer goes on to `/en/account`. The four other languages already did
    this (measured in a browser under German and Spanish, on both versions,
    with a spec that was not kept: `docs/TESTING.md`). No link of the
    application leads to such an address.
  - An address of this origin that contains `/signout` or `/auth/signin` is
    kept; it became `/en`.
  - `//host`, `/\host` and the same with a tab or a line break between the
    slashes become the base URL. They were answered with the base URL
    followed by that text.
  - An address of this origin with a user name or a password before the
    host becomes the base URL: in Chromium a page opened under such an
    address could not `fetch` a relative address (measured). A `blob:`
    address of this origin becomes the base URL as well.
  - The answer is the address as the URL parser resolved it, not the text
    that was sent: dot segments are resolved, a path without its leading
    slash is resolved from the root (`es/account` became the base URL), and
    `https://app.example` is answered with `https://app.example/` (it
    became `/en`).
  - Unchanged: a sign-in with e-mail and password ends on
    `/{locale}/account` (E2E suite: en, es, fr) and a sign-out on
    `/{locale}` (en, es); the account deletion asks for the same address as
    the sign-out (read in the source).
- **Documents.** `README.md` and `SECURITY.md` say first what the project
  does and protects, then the limits as a short list. The long paragraphs
  with the measurements moved to the new `docs/SECURITY-DETAILS.md`, and
  each of the 39 entries of the complete list in `SECURITY.md` links to its
  full text there. No limit was dropped: this release ends one (the English
  landing page after a link) and narrows one to the rows that earlier
  versions wrote (Google's stored tokens). In `SECURITY.md` the heading
  "Security Features" is now "What the application protects", and "Known
  Limitations & Hardening Notes" is "Known Limitations".
- **Screenshots.** The README shows eight, all taken on 2026-10-06, three
  of them new (the 2FA step of the sign-in, two parts of the account page).
  Fifteen image files are removed: thirteen that no file referred to and
  two that the README no longer shows.

### ⬆️ Upgrading from v2.5.0

- The database schema does not change (`prisma/schema.prisma` is the same
  file), so there is nothing to push. There is no new environment variable
  and no change in the message files.
- Run `pnpm install`: the lockfile changed.
- Optional: clear the tokens that earlier versions stored. One `UPDATE` of
  `"Account"`, printed in `docs/DEPLOYMENT.md`, sets the seven token columns
  to `NULL` in every row that holds a value in one of them. Measured on the
  test database (PostgreSQL 16.10) with four `Account` rows of two users,
  three of which held a value: it answered `UPDATE 3`, the other columns of
  the four rows and the two user rows were as before, and a second run
  answered `UPDATE 0`. No account is unlinked and no session ends. Run it
  when no instance of 2.5.0 is left; it does not reach a backup and revokes
  nothing at Google.
- Nothing else. Code of your own that reads a token column of `Account`, or
  that counted on an address with `/en` in it being sent to `/en`, finds
  the change under Security and Changed.

### 🧪 Tests

- Jest: 1598 tests (was 1537): 1545 without a database (was 1486) and 53 in
  the integration file (was 51). Playwright: 105 tests in 12 spec files (was
  103 in 11), counted with `playwright test --list`.
- Coverage: 78 % of statements (was 77 %); two runs gave 78.17 % and
  78.10 %.
- New files: `auth-config.redirect.test.ts` and `return-address.e2e.ts`;
  three unit tests on what the gate hands the adapter. The Auth.js source
  pin covers eleven files (was nine).
- The whole Playwright suite was run once on the code of this release, with
  the version set and before the documents were edited: 105 passed, exit
  code 0, no "Compiled" line of the dev server after the first test.

## [v2.5.0] - 2026-10-05

Linking Google is enforced on the server, the server answers in the
language of the page, and more of what nothing used is removed. The database
schema changes in both directions: read "Upgrading from v2.4.0" before you
deploy.

### 🔒 Security

- **The server links a Google account to an existing user only after the
  password step.** Up to 2.4.0 the account page asked for the password, but
  nothing on the server tied the Google sign-in to that step: Auth.js linked
  any Google account that was not linked to a user yet, when a signed-in
  user completed a Google sign-in with it (a Google account that belongs to
  another user is refused by Auth.js itself, then as now). A live session
  alone (an unattended browser, a copy of the session cookie) was enough to
  attach one's own Google account to a user. Now:
  - `POST /api/auth/link-account/initiate`, after it has checked the
    password, writes a grant on the user's row (`User.linkGrantProvider` and
    `User.linkGrantExpiresAt`: the provider, and an end 300 seconds later)
    and its `account_link_initiated` event in one transaction. Writing the
    grant is an update of the user's row, and so is spending it when Google
    returns: `User.updatedAt` moves at both (measured with the two
    statements on PostgreSQL; a spend that finds no live grant changes
    nothing). Up to 2.4.0 the password step wrote a security event and
    nothing else.
  - The adapter through which Auth.js writes `Account` rows is wrapped
    (`src/lib/auth/link-gate.ts`). Onto an existing user it links only after
    it has spent the grant, in one conditional `UPDATE`, and only when the
    user row it read shows no Google account. One password step allows one
    link.
  - Otherwise nothing is linked, Google's tokens are not stored, an
    `account_link_refused` event is recorded, and the browser is sent to
    `/auth/error?error=LinkNotConfirmed`, a page that says what happened and
    how to link, in the five languages.
  - The first Google sign-in of a new visitor and the sign-in of a returning
    Google user are as before. An account that signs in with Google only is
    refused a second Google account: it has no password to confirm with (up
    to 2.4.0 it was linked without a question).
  - Measured on real PostgreSQL by 30 tests of the integration file, through
    the adapter object that the application hands to Auth.js and through
    Auth.js's own decision function. Not measured: no test completes a
    Google sign-in. The exchange with Google, the redirect that answers a
    refusal and the page it ends on were read in the source of `@auth/core`
    0.41.3; a unit test fails when one of the nine files that were read
    changes (seven of `@auth/core`, one of `@auth/prisma-adapter` 2.11.3,
    one of `next-auth` 5.0.0-beta.32) or when one of the three packages is
    installed in another version. See `SECURITY.md` and `docs/TESTING.md`.
- **What the link gate does not cover.** The grant belongs to the user, not
  to the browser: from a correct password step until its grant is spent, at
  most 5 minutes, any live session of that user can have its own Google
  account linked. An account that signs in with Google only is not protected
  against a hijacked session, because adding a password needs only a
  session. Two password steps whose Google steps overlap can link two Google
  accounts to one user (measured). The password step asks for no TOTP code.
  The full list is in `SECURITY.md`, under "Linking Google needs the
  password, within these limits".
- **`allowDangerousEmailAccountLinking` no longer links onto an established
  user without the password step.** The application does not set this
  provider option. With it, Auth.js links a Google account to the user of
  the same e-mail address without a session. The gate refuses that link
  onto a user that has a password, an `Account` row or a verified e-mail
  and no live grant, and links a row with none of the three as it links a
  first sign-in (measured with Auth.js's decision function, not against
  Google). While a grant is live, up to 5 minutes after a correct password
  step, the gate links one Google account to a user that has none, and with
  this option Auth.js asks for no session on the way there (read in the two
  sources, not measured).
- **The unlink route accepted any provider.** With the right password and
  `provider: "credentials"`, `DELETE /api/auth/link-account/unlink` deleted
  the credentials `Account` row (read in the source of 2.4.0). It accepts
  only `google` now, and answers any other provider with 400 before the
  route queries the user (`unsupported_provider`; `invalid_request` when
  the provider is not a string).
- **One unlink removes every Google account of the user.** A user can hold
  more than one Google `Account` row: up to 2.4.0 nothing limited their
  number. The route deleted one row and cleared `User.hasGoogleAccount`, so
  a Google `Account` row could stay while the flag said there was none. It
  now deletes every row of the provider, in the transaction that clears the
  flag and writes the event. The measurement, with two Google rows on one
  user, is in `SECURITY.md`.
- **A link or unlink request with a malformed body is refused before the
  route queries the user.** A body that is not JSON, or that is a JSON
  `null`, string, number or boolean, is answered with 400 `invalid_request`.
  So is an object in which both fields are there and one of them is not a
  string (a number other than 0, `true`, an object, a list). None of them is
  counted as a wrong password. Up to 2.4.0 a body that is not JSON and a
  `null` ended in 500, and so did a password that is not a string where the
  route got as far as the password check; a JSON string, number or boolean
  was already 400 "Password and provider are required"; a provider that is
  not a string was 400 "Unsupported provider" at the initiate route and went
  on to the password check at the unlink route. A JSON list, and an object
  in which a field is missing, empty, `0`, `false` or `null`, are answered
  as before, 400 "Password and provider are required", now with the code
  `missing_fields`. Measured with the function that reads the body, and for
  2.4.0 with the statements of its two routes, replayed with bcryptjs 3.0.2.
  The session check runs before any of this and reads the user and the list
  of ended sessions, as for every request; a request without a session is
  answered 401, and one over the throttle 429, before the body is read (read
  in the two routes; their unit tests replace the session check).
- **Security events store less of what the client sends.** The four events
  of the link / unlink routes (`account_link_initiated`,
  `account_link_failed`, `account_unlinked`, `account_unlink_failed`) stored
  the raw `X-Forwarded-For` header (without it the raw `X-Real-IP`, without
  both the text `unknown`) and the whole `User-Agent` (without that header
  the text `unknown`). They now store the client IP as the rate limiter
  reads it (a valid address or nothing) and at most the first 512 characters
  of the `User-Agent` (nothing when the header is missing). The e-mail
  verification, 2FA and lockout events stored the whole `User-Agent` too.
  `logSecurityEvent()` itself now drops an address that is not a valid IP
  and cuts the `User-Agent`, whatever its caller hands it. Rows that are
  already in the table keep what they have.
- **The rate-limit keys built from an e-mail address are at most 254
  characters** (registration and the verification e-mail). Both actions
  count an attempt before anything validates the address, and the limiter
  kept a text of any length whole. A value that is no text has no e-mail
  key: the attempt counts against the client IP alone.
- `verifyEmailToken` passed its `locale` argument unchecked to the
  translation lookup. Only the five supported locales are accepted now; any
  other value gets the default.
- Five form actions did the same with the language that the client sends:
  `deleteUserAccount`, `updateUserProfile`, `addPasswordToGoogleUser`,
  `changeUserPassword` and `enableTwoFactorAuth` handed the form field
  `_locale`, or the cookie `NEXT_LOCALE` when the field is missing or says
  `en`, to the translation lookup as the client sent it
  (`resolveFormLocale()`). A value that is not one of the five locales now
  counts as not sent (read in the source of both versions).
- The sign-in page forwards the `error` parameter to the error page encoded,
  so a value with `&`, `?` or `#` stays one parameter.
- A command that throws a value that is not an Error is described by its
  kind (`Non-Error value thrown: object`), never by its content: in the
  failed event, in the log lines and in the audit entry of the command bus.
  Up to 2.4.0 the failed event carried the `message` property of a thrown
  object, and a thrown `null` or `undefined` ended in a `TypeError` inside
  the bus, without a failed event. The bus rethrows exactly what was thrown.

### 🔧 Changed

- **What the server says is in the language of the page.** Registration and
  password change, their rate limits, the rate limit of the verification
  e-mail and a wrong 2FA set-up code were answered in English on every page.
  They are answered from the message files now (en, es, fr, it, de).
  `registerUser` takes the language from the form field `_locale`, as the
  other form actions do; it read an unchecked field `locale`, which the
  application's own form never sent. When the command bus fails
  unexpectedly, `registerUser` answers a translated error; it rejected.
- The event `user.registered` and the metadata of the registration command
  carry the language in which `registerUser` answers (`metadata.locale`).
  Up to 2.4.0 they carried `en` for every registration sent by the
  application's own form. A listener of your own that reads it, for example
  to choose the language of an e-mail, now gets that language.
- Three English answers changed, because the old ones showed internals:
  "Invalid input for field: currentPassword" is now "The current password is
  incorrect", "Operation 'change password' is not allowed: No password set
  for this account" is "No password is set for this account", and "User with
  ID '<id>' not found" is "User not found".
- **The account page says a failure in its own language.** The failures of
  `/api/account/info` and the refusals of the link / unlink routes carry a
  `code`, and the page shows the text of that code (for the link routes: 8
  new texts in each language). It showed the English text of the route as it
  was. On the English page the wording changed with it: "Invalid password"
  is now "The password is not correct.", "Account already linked to this
  provider" is "A Google account is already linked to this account.",
  "Account not linked to this provider" is "No Google account is linked to
  this account.", "Authentication required" is "Your session has ended.
  Please sign in again.", "User not found or no password set" is "This
  account has no password yet. Set a password first." (the session text
  when the user row is gone), and the "Internal server error" of the
  initiate route is "Failed to initiate account linking". From
  `/api/account/info`, "Unauthorized" is "You are not authorized to perform
  this action" and "Failed to load account information" is "Failed to load
  account info". What the routes themselves answer is described below.
- **A verification link that is opened a second time says that the address
  is verified.** The page verifies while it renders, and a token works once:
  a reload, a change of language, or the user after something else had
  opened the link read "Verification Failed", although the address was
  verified. Such a request now answers "already verified" (its own heading
  and text), writes nothing and records no second `email_verified` event,
  and `verifyEmailToken` answers success with `data.alreadyVerified: true`.
  An unused link of an address that is already verified answers the same and
  is used up. Of several requests that arrive together, one verifies (the
  measurement against PostgreSQL is in `docs/ARCHITECTURE.md`). A used link
  of an address that is not verified, an expired link and an unknown link
  fail as before.
- **The language selector keeps the page.** It replaces the locale segment
  of the current path and keeps the query string and the fragment. Up to
  2.4.0 it asked a hand-kept list of routes, which had no entry for
  `/register`, `/auth/error` and `/verify-email/<token>`: there a change of
  language led to the home page, and on every page the query string and the
  fragment were dropped. A page added under `src/app/[locale]/` now works
  with the selector without being registered anywhere.
- **Links to pages that do not exist are gone:** three cards of the admin
  page ("Manage Users", "Security Logs", "System Settings"; "System Metrics"
  stays), two of the user dashboard ("Upgrade to Pro", "Help & Support") and
  the "Contact Support" line of the auth error page.
- After a sign-up the browser goes to `/{locale}` (it was
  `/{locale}?registered=true`), after an account deletion to `/{locale}`
  (`?deleted=true`), after the Google step of linking to `/{locale}/account`
  (`?linked=google`). Nothing read the three parameters.
- **Security events, for whoever reads the table.** Two new types:
  `account_link_completed` (metadata `provider` and `providerAccountId`;
  written by the gate after the `Account` row of a link onto an existing
  user) and `account_link_refused` (`success: false`; metadata `provider`
  and `reason`, which is `no_grant` or `already_linked`). The first Google
  sign-in of a new visitor writes neither. Neither has an IP address or a
  `User-Agent`: Auth.js hands an adapter no request. A refused link counts
  as an error in the error rate of `GET /api/admin/metrics` and toward its
  `highErrorRate` alert (read in the code, not measured). The metadata of
  `account_unlinked` is
  `{ provider, accountsRemoved, providerAccountIds, accountIds }`; it was
  `{ provider, providerAccountId, accountId }`, and rows written before keep
  that. A query that looks for `ipAddress = 'unknown'`, or that splits a
  comma-separated `ipAddress`, finds only rows written up to 2.4.0. The four
  events of the link / unlink routes no longer write `unknown` as
  `userAgent` either: without the header the column is empty, and a query
  for `userAgent = 'unknown'` finds a row written by 2.5.0 only when a
  client sent that text.
- **The answers of the link routes.** Every refusal of
  `POST /api/auth/link-account/initiate` and
  `DELETE /api/auth/link-account/unlink` carries a `code` next to its
  English `error`: `authentication_required` (401), `too_many_attempts`
  (429), `invalid_request`, `missing_fields` and `unsupported_provider`
  (400), `user_not_found` and `password_not_set` (404), `invalid_password`
  (401), `already_linked` (400, initiate only), `not_linked` (404, unlink
  only), `internal_error` (500). Every code but `invalid_request` carries
  the English text that 2.4.0 answered with, and the 200 answers are
  unchanged. `invalid_request` is new and says "Invalid request body": a
  JSON string, number or boolean as body used to get "Password and provider
  are required", and a provider that is not a string "Unsupported provider"
  at the initiate route. The answer 400 "Cannot unlink the only
  authentication method", which no request could get, is removed. These
  status codes changed:
  - A body that is not JSON or is `null` is 400 (was 500). A password that
    is not a string is 400; it was 500 where the route got as far as the
    password check, and 404 for a user without a password.
  - At the unlink route a provider other than `google` is 400, before the
    route queries the user. With the right password it was 404 "Account not
    linked to this provider" when the user had no account of that provider,
    and 200 for `credentials` (see Security); with a wrong password it was
    401, counted toward the throttle and recorded as
    `account_unlink_failed`; for a user without a password it was 404.
  - An unlink that finds no row left to remove, because another request
    removed them, answers 404 `not_linked` and writes nothing. It was 500
    "Failed to unlink account": the route deleted a row that it had read
    before (read in the source of 2.4.0; measured is only that Prisma's
    `delete` throws for a row that is gone).
- `/api/account/info`: each failure carries a `code` (`unauthorized`,
  `userNotFound`, `accountInfoUnavailable`, `failedToLoadAccountInfo`). The
  `message` and the status codes are unchanged.
- `enableTwoFactorAuth`, wrong code: `errors.verificationCode` is an array
  that holds the translated message; it was the string "Invalid verification
  code".
- **Server log.** Two runs of one command that overlap each log their own id
  and duration; `BaseCommand` kept those of the run that started last. Each
  refused link makes Auth.js log an `AdapterError` at error level, twice
  (read in the source of `@auth/core` 0.41.3, not measured). The Jest
  integration client (`src/lib/prisma-test.ts`) prints a notice when it sets
  a `DATABASE_URL` aside for the docker test database; which URLs it accepts
  is unchanged. The hybrid test file in real mode (`TEST_MODE=real`)
  connects through that client now. Up to 2.4.0 it used any `DATABASE_URL`
  as it was; now one that does not contain `5433` is set aside and the run
  goes to the docker test database on 127.0.0.1:5433 (read in the source,
  not run that way). `pnpm test:hybrid:real` names that database itself and
  is not affected.
- The session provider has the same settings in every environment: its
  branch for `NODE_ENV=test` is removed.
- CI runs `pnpm validate-translations` in the `checks` job.

### 🗑️ Removed

A project that imported or called one of these no longer compiles, unless
the entry says otherwise. Nothing in the application uses them any more. Up
to 2.4.0 it used some of them: the language selector called `RouteValidator`
and `SafeNavigation`; the two commands called `createSuccessResponse`,
`logSuccess()` and `logError(error)`; `enableTwoFactorAuth` called
`createFieldErrorResponse`; the auth error page read two of the message
keys; the application wrote three of the four dropped columns without
reading them (`emailVerificationRequired`, `twoFactorEnabledAt`,
`requiresPasswordChange`); and the E2E set-up and teardown emptied the table
`PasswordResetToken`. Nothing else in the list was used outside the layer
that defined it and outside the tests (read in the diff of the application's
files between the two tags; for the message keys, a search of the sources of
2.4.0).

- **Prisma schema:** the model `PasswordResetToken` with
  `User.passwordResetTokens`, and four fields of `User`:
  `emailVerificationRequired`, `twoFactorEnabledAt`, `requiresPasswordChange`
  and `lastLoginIp`. With them go the type re-export `PasswordResetToken` of
  `src/lib/types/prisma.ts`, `"password_reset"` in the event type of
  `src/lib/security.ts` and `UpdateUserDTO.requiresPasswordChange`. The date
  on which 2FA was enabled is no longer on the user row; the `2fa_enabled`
  event is written as before.
- **Navigation:** the module `src/types/routes.ts` (`RouteValidator`,
  `SafeNavigation`, `StaticRoute`, `DynamicRoute`, `LocaleRoute`,
  `AppRoute`), and from `src/lib/utils/navigation.ts` `localizedRedirect`,
  `isProtectedRoute`, `isPublicRoute` and six entries of `routes` (`home`,
  `account`, `signin`, `register`, `error`, `verifyEmail`). Write the path,
  or use `localizedPath("register", locale)`. `localizedPath`,
  `getPathWithoutLocale`, `switchLocale` and `routes.dashboard` stay.
  `switchLocale` now answers the home page of the new locale for a path
  whose dot segments (`..`, `%2e%2e`) lead out of that locale; it handed
  such a path on (measured with both versions of the function).
- **Form helpers:** from `src/lib/utils/form-responses.ts`
  `createSuccessResponse` and `createFieldErrorResponse` (use
  `createSuccessResponseI18n` and `createFieldErrorResponseI18n`),
  `createGenericErrorResponse`, `CommonErrorType`, `withErrorHandling`,
  `isSuccessResponse` and `hasFieldErrors`; from `form-locale-server.ts`
  `getFormTranslations`. `resolveFormLocale()` now returns a `Locale`, and
  only a supported one (see Security); a caller that takes its result as a
  string still compiles (measured with `tsc`).
- **Components:** the `gradient` prop of `GradientPageLayout` (one gradient
  remains) and `CardFooter`.
- **Command layer:** the protected fields `commandId` and `executedAt` of
  `BaseCommand`. `logExecution()` returns the run, and `logSuccess(run)` and
  `logError(run, error)` take it, so a command written for 2.4.0 no longer
  compiles: write `const run = this.logExecution(metadata)` and pass `run`
  on. Also `AuditMiddleware.getAuditLogsByUser` and `clearAuditLogs`.
  `ICommandMiddleware.onError` receives `unknown`, not `Error`. A middleware
  that declares `error: Error` still compiles (measured with `tsc`); the bus
  hands it what was thrown, which need not be an Error, as it did under the
  type `Error`.
- **Error layer:** only the two commands use it. 33 of its 39 error classes
  and 33 of the 39 members of `ErrorCode` are removed. What stays:
  `ValidationError`, `InvalidInputError`, `OperationNotAllowedError`,
  `ResourceNotFoundError`, `ResourceAlreadyExistsError` and `InternalError`,
  with their codes. `ErrorFactory` loses its groups `auth` and `system` and
  keeps `validation.fromZod`, `validation.invalidInput`,
  `business.operationNotAllowed`, `business.notFound`,
  `business.alreadyExists` and `wrap`. `ErrorBuilder` keeps `withUserId`,
  `withCorrelationId`, `validation.invalidInput`,
  `business.operationNotAllowed` and `business.alreadyExists`. Also removed:
  five members of `ErrorCategory` (`AUTHENTICATION`, `AUTHORIZATION`,
  `RATE_LIMITING`, `INTEGRATION`, `UNKNOWN`), two of `ErrorSeverity`
  (`MEDIUM`, `CRITICAL`), `ErrorContext.requestId`, `path` and `method`
  (code that sets them still compiles, through the index signature of
  `ErrorContext`; code that reads one as a string does not: measured with
  `tsc`), and twelve detail interfaces (`ErrorDetails` is a plain record).
  The six errors that stay have the code, category, severity, status,
  message and log output they had
  (`src/lib/errors/__tests__/error-layer.test.ts`).
- **Repository layer:** from `PrismaRepository` `findOne`, `findAll`,
  `findPaginated`, `create`, `createMany`, `updateMany`, `deleteMany`,
  `exists`, `count` and the protected `transaction()` (the first nine also
  from `IRepository`); `update` is abstract. From `UserRepository` and
  `IUserRepository` `findByCredentials`, `updateLastLogin`, `verifyEmail`,
  `enableTwoFactor`, `disableTwoFactor` and `findByProvider`. Also
  `RepositoryProvider.reset` and `.transaction`, the types
  `PaginationOptions`, `PaginatedResult`, `QueryOptions` and
  `PrismaTransactionClient`, and nine of the eleven members of the type
  `PrismaModelDelegate` (`findUnique` and `delete` stay).
- **Events layer:** `BaseEvent.correlate`, `getAge` and `isOlderThan`,
  `AnalyticsHandler.reset` and `AuditLogHandler.getStats`. The uncalled
  members of the event bus stay (`docs/ARCHITECTURE.md`).
- **Message keys:** 112 per locale, from all five message files: the
  namespaces `Dashboard` (17 keys) and `TwoFactor` (24), and keys of
  `Account` (17), `Errors` (13), `TwoFactorSetup` (9), `Common` (8),
  `Registration` (7), `Auth` (5), `ConsoleMessages` (4), `LoadingStates`
  (3), `Success` (3) and `ComponentErrors` (2). Their names are in the diff
  of `messages/en.json` between the two tags. No code read 110 of them (a
  search of the sources of 2.4.0). The other two, `Auth.error.needHelp` and
  `Auth.error.contactSupport`, were the "Need help? Contact Support" line of
  the auth error page, which is removed (see Changed); the removal of the
  other 110 changes no text on a page. A project that still reads one
  compiles unless the read is typed; next-intl then shows the key's path in
  place of the text (read in the source of use-intl 4.14.7, not measured).
  Four keys that nothing read in 2.4.0 are read now and have another text:
  `Errors.invalidVerificationCode`, `Errors.currentPasswordIncorrect` (the
  same text as before in es and fr), `Success.accountCreated` and
  `Success.passwordChanged`. With the 22 new keys a file has 276 keys (was
  366). Also gone are the second writings of keys that a file wrote twice
  (11 in en and in it, 1 in es and in de): `JSON.parse` kept the last one,
  and the parsed texts of those keys are the same as before.
- **Scripts and dependencies:** `db:setup:all` with
  `scripts/setup-databases.sh` (it called a `dotenv` command that no
  dependency provides; use `pnpm docker:up`, `pnpm db:setup` and
  `pnpm db:push:test`), `test:e2e:firefox` and `test:e2e:webkit` (the
  Playwright configuration defines the project `chromium` only), and the
  dependencies `negotiator` and `@types/negotiator`, which nothing imported.
- **Test support under `src/test`:** `UserBuilderFactory`, `userBuilders`,
  `AccountBuilderFactory`, `AccountScenarios`, `accountBuilders`,
  `SessionBuilderFactory`, `sessionBuilders`, `NextAuthSessionBuilder`,
  `BuilderFactory`, `StatefulBuilder`, `createBuilder` and `BuilderMethods`;
  `mockPrisma`; everything that `src/test/utils/test-utils.tsx` exported
  except `generate`; `UserBuilder.requiresPasswordChange()`, and the second
  argument of `UserBuilder.withLastLogin()`; the exports `dbHelpers`,
  `TEST_MODE` and `IS_REAL_DB` of
  `src/test/hybrid/__tests__/auth.hybrid.test.ts`.

### ⬆️ Upgrading from v2.4.0

- **The database, in one of two orders.** One `pnpm prisma:push` adds the
  two link-grant columns and drops the table `PasswordResetToken` and the
  four columns of `User`. The code of 2.5.0 cannot read a whole user row or
  create a user before the two columns exist, and the code of 2.4.0 can do
  neither once the four are gone (measured with the Prisma client of each
  version: P2022 in both directions). Sign-in reads the whole row (read in
  the source), so neither "push, then start the new code" nor the reverse
  works without a time in which nobody can sign in. Either:
  - stop the application, push from the tree of 2.5.0 (after `pnpm install`:
    the push applies the schema of the tree it is run in), then build and
    start the code of 2.5.0; or
  - add the two columns by hand (the `ALTER TABLE` statement is in
    `docs/DEPLOYMENT.md`), start the code of 2.5.0, and push when no
    instance of 2.4.0 runs any more.
- **Once the database has a user, the push drops data, and it stops or asks
  first.** Without `--accept-data-loss`, where its input is no terminal or a
  CI variable is set, it stops with exit code 1 and changes nothing
  (measured with no terminal attached). In a terminal Prisma asks "Do you
  want to ignore the warning(s)?" instead: a yes pushes at once and drops
  what it listed, a no ends with "Push cancelled." and exit code 130 (read
  in the source of the Prisma CLI 6.19.3, not measured). The push names
  `emailVerificationRequired` and `requiresPasswordChange`, which hold a
  value in every user row, and `twoFactorEnabledAt` when a user row holds a
  value there (a user who enabled 2FA and has not disabled it since).
  `pnpm prisma:push --accept-data-loss` then completes. The flag, like the
  yes, accepts every warning of that push: read first what the push lists.
  Measured on 2026-10-05 on a scratch database with the schema of 2.4.0 and
  rows in five tables, both orders as one sequence each: every column that
  stays, of every row, was the same before and after. The outputs, what was
  not measured (the application itself was not started during the upgrade)
  and the way back are in `docs/DEPLOYMENT.md`.
- A development database needs the same push (`pnpm prisma:push`), and so
  does the test database (`pnpm db:push:test`), each with the flag when it
  holds a user row.
- Run `pnpm install` first (two dependencies are gone), and
  `pnpm prisma:generate` before `pnpm build`. There is no new environment
  variable.
- No session ends: the session check is unchanged. Whoever was between the
  password step and the Google step during the upgrade repeats the password
  step. Google accounts that were linked before stay linked, also where a
  user has more than one; one unlink then removes them all.
- **Message files.** Search your own code for the removed keys (see
  Removed). A project with a locale file of its own adds the 22 new keys (9
  in `Errors`, 8 in `Account.linkErrors`, 3 in `Auth.error`, 2 in
  `EmailVerification`) and deletes the 112 removed ones:
  `pnpm validate-translations` names a missing key and an extra key and
  fails on either (measured). It runs in the pre-commit script and, from
  this release, in CI. It checks the five files of its list
  (`SUPPORTED_LOCALES` in `scripts/validate-translations.js`): a sixth file
  is checked only once its locale is in that list (measured: a sixth file
  with a key missing and a removed key kept passes). A sixth message file
  also needs its name in the list of
  `src/test/unit/__tests__/message-keys.test.ts` ("reads the message files
  and the sources") and its locale in the list of
  `src/test/unit/__tests__/link-targets.test.ts` ("reads the routes, the
  locales and the sources"): both tests compare the files of `messages/`
  with the five names and fail on a sixth, whatever keys it has (measured
  on a copy of the tree).
- **Message keys of your own.** `pnpm test:unit` now fails when no
  application file under `src/` reads a key of `messages/en.json` in a form
  that the guard takes for a read: `t("key")` (also `t.rich`, `t.markup`,
  `t.raw`, `t.has`) on a name that the same file binds to `useTranslations`
  or `getTranslations` with the namespace written in place; the key handed
  to one of the five `Errors` / `Success` helpers; or the full path of the
  key as a string. A key you add needs such a reader. A key that is read
  through a template, through a namespace in a variable, by a function in
  another file that is handed the translator, or by a test alone is reported
  as unread (measured on a copy of the tree) and needs an entry, with the
  place that reads it, in `ALLOWED_UNREAD` of
  `src/test/unit/__tests__/message-keys.test.ts`. The test "reads the
  message files and the sources" of that file names four keys and three
  files of the starter as its control (`Home.title` among them): a project
  that removes one of them adjusts that list.
- **Your own code and tests.** A test that mocks `@/lib/security` with a
  factory and reaches the actions, the link routes or `authorize()` needs
  `requestMetadata` in the factory. A form of your own that posts to
  `registerUser` sends the language as `_locale` (`useLocalizedAction` does
  it). A client of the link routes finds the status codes that changed, and
  the one new text, under Changed ("The answers of the link routes"). A
  test that waits on the account page for the English text of a route waits
  for the text of its code (the texts are under Changed). A caller of
  `verifyEmailToken` gets a success for a repeated call on a verified
  address. Code or tests that wait for `?registered=true`, `?deleted=true`
  or `?linked=google` wait for the address without it. A run of the hybrid
  test file in real mode against a database of your own keeps `5433` in its
  `DATABASE_URL` (see "Server log" under Changed).
- **Updating Auth.js.** `pnpm test:unit` fails
  (`src/test/unit/__tests__/authjs-source-pin.test.ts`) as soon as
  `next-auth`, `@auth/core` or `@auth/prisma-adapter` is installed in
  another version, until the files that the test names are read again and
  the versions and hashes are recorded there (read in the test).
- **Your CI.** `pnpm test:unit` reads `.github/workflows/ci.yml`
  (`src/test/unit/__tests__/ci-workflow.test.ts`). It fails when the file is
  missing, when the file has no job named `checks`, or when that job does
  not run `pnpm typecheck`, `pnpm lint`, `pnpm test` and
  `pnpm validate-translations`, each as a one-line `run:` command (measured
  on a copy of the tree: without the file, with the job renamed, with
  `pnpm test` replaced, and with the validator inside a `run: |` block). A
  project with another CI changes or removes that test.
- **Pages and links of your own.** A page under `src/app/[locale]/` has to
  be named in `e2e/tests/language-selector.e2e.ts`, or the first test of
  that spec fails. A literal internal link in `src/app` or `src/components`
  that no page and no route handler under `src/app` serves fails
  `pnpm test:unit` (`src/test/unit/__tests__/link-targets.test.ts`): a link
  to a page that does not exist, and also a link without a locale (which the
  middleware redirects) and a link to a static file (measured on a copy of
  the tree). Write the locale, or add the link with its reason to
  `ALLOWED_DEAD_LINKS` in that file. The same file fails on a page under a
  private `_folder` (measured), a parallel `@slot` or an intercepting
  `(.)folder` (read in the test), and it names routes and links of the
  starter's own pages as its control: a project that removes the admin page,
  or the redirect to `/dashboard/pro`, adjusts that list (measured the same
  way). A removed member that you restore needs its row deleted from the
  list in `src/test/unit/__tests__/dead-code.test.ts`.
- A provider or an event of your own that changes a new user between
  Auth.js's `createUser` and its `linkAccount` (a password, an `Account` row
  or `emailVerified`) makes first Google sign-ins fail: see `SECURITY.md`.

### 🧪 Tests

- Jest: 1537 tests (was 849): 1486 without a database (was 825) and 51 in
  the integration file (was 24). Playwright: 103 tests in 11 spec files (was
  90 in 10), counted with `playwright test --list`.
- Coverage: 77 % of statements (was 56 %); two runs gave 77.63 % each.
- Message keys: 276 per locale (was 366).
- The link gate is tested on real PostgreSQL: 30 of the 51 tests of the
  integration file, three of which force calls to overlap with a lock that a
  second client holds. `jest.config.js` lets `@auth/core` and
  `@auth/prisma-adapter` be transformed for them, and throws when `next/jest`
  no longer generates the two patterns it extends. Three tests of the file
  went with `UserRepository.findByCredentials`.
- The unit suite has 27 new test files (92, was 65). The unlink route has
  its first tests (55) and the link-initiation route has 49 (was 31). The
  error layer has a test file of its own, and three pages have their first
  unit tests (auth error, sign-in, e-mail verification).
- Four new guards in the unit suite. It fails when a key of
  `messages/en.json` is read by no application file under `src/`, or a
  message file writes a key twice; when a literal internal link has no page
  and no route handler; when a file of Auth.js that the link gate was read
  against is no longer the file that was read, or one of the three Auth.js
  packages is installed in another version; and when the `checks` job of
  `.github/workflows/ci.yml` no longer runs the translation validator. What
  each of them takes for a read, a link or a job, and what else makes it
  fail in a project of your own, is under "Upgrading from v2.4.0". The
  dead-code guard lists what this release removes, so that none of it comes
  back unnoticed.
- E2E: the new spec `language-selector.e2e.ts` (11 tests) changes the
  language through the selector on every page that can be shown, and fails
  when a page under `src/app/[locale]` is not named in it. The warm-up
  requests fourteen entries (was twelve).
- No test asserts how long something took any more. The three assertions
  that did are removed: an average of 400 ms and of 500 ms per registration
  in the hybrid file, and 15 s for a bulk insert in the integration file.
  The tests that force an overlap have a time limit of their own and release
  their lock when they fail.
- The whole Playwright suite was run once on the code of this release,
  before the version and the documents were edited: 103 passed, exit code
  0, no "Compiled" line of the dev server after the first test.

## [v2.4.0] - 2026-10-03

### 🔒 Security

- The page `/[locale]/link-account/confirm/[token]` is removed. It was the
  second half of an older way to link an account, by a link sent in an
  e-mail; nothing in the application sent that e-mail any more. Opened with a
  valid token, the page needed no session and, while answering a `GET`, set
  `User.hasGoogleAccount`, wrote a security event `account_linked` and sent a
  security-alert e-mail, although no Google account was linked. The address
  now answers 404.
- `POST /api/auth/link-account/initiate` no longer creates a link token and
  no longer returns `linkToken` and `expiresAt`, which the browser never
  used. Its checks are unchanged: session, rate limit, password.

### 🔧 Changed

- Linking and unlinking Google work as before: the account page checks the
  password, then the user signs in to Google (not measured against Google
  itself: the E2E suite checks the password step through the real route and
  database).
- The `account_link_initiated` security event no longer has `linkRequestId`
  in its metadata.
- Nothing writes an `account_linked` security event or sends an
  `account_linked` alert any more. Rows of that type in an existing database
  do not show that a Google account was linked (see `SECURITY.md`).

### 🗑️ Removed

- The Server Action `confirmAccountLinking` and `routes.linkAccount`.
- The Prisma model `AccountLinkRequest` and `User.accountLinkRequests`.
- The message namespace `AccountLinking` (13 keys) and, in `Errors`,
  `invalidLinkingToken`, `accountLinkingCompleted`, `linkingTokenExpired`,
  `failedToConfirmAccountLinking`; in `Success`, `accountLinked`: 18 keys,
  from all five message files. A project that still uses one of them
  compiles; next-intl then shows the key's path in place of the text (read in
  the source of use-intl 4.14.7, not measured).
- `"account_linked"` from the alert type of `src/lib/email.ts` and from the
  event type of `src/lib/security.ts`; the `gradient` prop of
  `FormPageLayout` and the gradient `green-blue`, which only the removed page
  used.

### ⬆️ Upgrading a database from v2.3.0

- The schema drops the table `AccountLinkRequest`. Measured on the test
  database: when the table is empty, `pnpm prisma:push` drops it without a
  question. When it holds rows, the push stops with exit code 1 and changes
  nothing; `pnpm prisma:push --accept-data-loss` then drops the table and
  leaves the users. The flag accepts every data-loss warning of that push, so
  check first that this table is the only one named. Versions up to 2.3.0
  wrote a row each time a user entered the right password to link Google, so
  a database where linking was started has rows. Details in
  `docs/DEPLOYMENT.md`.
- The test database needs the same push: `pnpm db:push:test`.

### 🧪 Tests

- Jest: 849 tests (was 803). Playwright: 90 tests (was 88).
- The link-initiation route has its first tests (31), and an E2E test checks
  that the old address answers 404.
- The E2E warm-up requests twelve entries (was ten): the link-initiation
  route and the not-found page are added.
- Coverage: 56 % of statements (was 55 %).

## [v2.3.0] - 2026-10-03

A clean-up of code that nothing used, decided item by item, and the defects
found on the way.

### 🔒 Security

- The public action that sends the verification e-mail put its `locale`
  argument unchecked into the e-mailed link and into the e-mail's HTML. Only
  the five supported locales are accepted now; any other value gets the
  default.
- No personal data stays in the in-memory lists of the events layer and of
  the command bus.
  - Events layer: removed a notification queue that gained an entry at every
    registration (e-mail address, name, user id) and at every password change
    (user id), was never emptied, sent nothing and marked its entries "sent";
    and an event store that kept full copies of up to 10,000 events. The two
    example listeners that remain keep ids and outcomes, and for errors the
    type and code only.
  - Command bus: its audit list (the newest 1,000 entries) kept each
    command's input with only the password fields redacted (for a
    registration the name and the e-mail address, also when it was refused),
    its output, the error text and the whole metadata. An entry now keeps the
    command name, the ids, the time, the duration, the outcome and, for a
    command that threw, the class name of the error. The shared command
    instances no longer keep the last run's metadata.
- Registration and password change took `ipAddress` and `userAgent` from the
  submitted form, so a client could put any text of any length into the
  command metadata. They come from the request now (the User-Agent cut to 512
  characters).
- A registration refused because the address is taken printed that address to
  the server console, in the details of the logged error. It now logs which
  field collided, not its value.
- Four Server Actions that nothing called are removed; one of them returned
  the linked-account rows, tokens included, to the signed-in user.
- The public collector `/api/analytics/web-vitals` is removed: an endpoint
  without authentication and without a rate limit that stored every valid
  metric anyone posted (up to 1,000 entries) and returned the aggregates to
  anyone. The application itself never sent it a metric that it accepted
  (read in the v2.2.0 source, not measured).

### 🔧 Changed

- Five actions take "user not found" from the message files instead of an
  English literal: two-factor set-up, enable and disable, sending the
  verification e-mail, adding a password. The three two-factor actions do the
  same for "not signed in"; in English, "You must be signed in." becomes "You
  are not authorized to perform this action". The account page now passes its
  locale to two-factor set-up and disable, which answered in English whatever
  the page's language; both accept only the five supported locales.
- `GET /api/admin/metrics` no longer returns the `performance` block (always
  zero), `alerts.slowOperations` and `alerts.slowQueries` (always empty) and
  `database.sessionCount` (always 0). `DELETE /api/admin/metrics`, which
  answered "cleared" while clearing nothing, is removed.
- `CommandExecutedEvent.payload.success` is true only when the command's
  answer has `success: true`; it was true for every command that returned, a
  refused one included. A command whose answer has no `success` field (none
  in the application) is now reported as not successful. The average command
  duration of the analytics listener no longer counts the newest run twice.
- The audit entries of the example listener have no `ipAddress` /
  `userAgent`; `getAnalyticsSummary().totals` has no `logins` /
  `failedLogins` (they could never rise above zero). The `[AUDIT]` lines that
  the audit listener prints to the server console have the same reduced
  details: the line of a command that threw no longer has the error text; the
  line of a critical error has the type and the code, no longer the message
  and the rest of the context.
- The entries of `AuditMiddleware.getAuditLogs()` have `success` and, for a
  command that threw, `errorType`; they no longer have `input`, `output`,
  `error` and `metadata`. `BaseCommand` keeps `commandId` in place of
  `metadata`. The development log line of the logging middleware reads
  "[Command:X] Completed".
- `LOG_LEVEL` and `SENTRY_DSN` are no longer read by anything.

### 🗑️ Removed

A project that imported one of these no longer compiles. Most had no caller
in the application; four were wired in: the notification handler and the
event store received every event (see Security), the account page started
`trackAccountPageMetrics`, and `/api/admin/metrics` read the performance
monitor, into which nothing recorded (see Changed).

- Events: `NotificationHandler`, `getNotificationHandler`,
  `processNotificationQueue`, `InMemoryEventStore`, `eventStore`,
  `getEventStore`, `getEventHistory`, `IEventStore`, `EventFilter`,
  `emitEvent` (use `eventBus.publish`), the catalogues `AuthEvents`,
  `SecurityEvents` and `SystemEvents`, and the 20 event classes that nothing
  published. Five events remain: `UserRegisteredEvent`,
  `PasswordChangedEvent`, `CommandExecutedEvent`, `CommandFailedEvent`,
  `ErrorOccurredEvent`.
- Server Actions `getUserAccountInfo`, `migrateUserAccountMetadata`,
  `initiateAccountLinking`, `getEnhancedUserAccountInfo`, and what only they
  used: `sendAccountLinkConfirmation`, `createAccountLinkTemplate` and
  `RATE_LIMITS.accountLink`. Also removed, without any caller: the
  data-access `getUserAccountInfo`, and `createGenericErrorResponseI18n` with
  its helper `translateCommonError`.
- 14 message keys, from all five message files: in `Errors`, `notFound`,
  `forbidden`, `serverError`, `unknown`, `alreadyExists`, `invalidInput`,
  `accountLinkingInProgress`, `failedToSendConfirmationEmail`,
  `failedToInitiateAccountLinking`, `failedToFetchAccountInfo`,
  `failedToMigrateAccountMetadata`; in `Success`, `accountMetadataUpdated`,
  `confirmationEmailSent`, `accountInfoRetrieved`. A project that still uses
  one of them compiles (the messages are not typed); next-intl then shows the
  key's path, such as `Errors.notFound`, in place of the text (read in the
  source of use-intl 4.14.7, not measured).
- Roles: `RoleGuard`, `RoleVisibility`, `useRole`, `hasExactRole`, `isAdmin`,
  `isProUser`, `requireRole` (`withRole` stays), and the unused members of
  `SafeNavigation` and `RouteValidator`.
- Forms: `useMultiStepForm`, `useSafeLocaleWithOptions`.
- Performance: `src/lib/performance/` (web vitals), `src/lib/monitoring/`
  (the performance monitor and its logger) and the dependency `web-vitals`.
- Routes: `/api/analytics/web-vitals` (`GET` and `POST`) and
  `DELETE /api/admin/metrics`.

### ⬆️ Upgrading from v2.2.0

- No schema change and no new setting.
- Search your own code for the 14 removed message keys (see Removed): a
  removed key fails at run time, not at compile time.

### 🧪 Tests

- Jest: 803 tests (was 721). Playwright: 88 tests (unchanged).
- The events layer has its first tests, with the real bus and listeners.
- The dead-code allow-list went from 21 entries to 1.
- Coverage: 55 % of statements (was 43 %).

## [v2.2.0] - 2026-10-02

### 🔒 Security

- **Sessions end on the server.** Every decode of the session cookie is
  checked against the database. Signing out ends that session (a copy of its
  cookie, or a session response that arrives late, is refused); a password
  change ends every session of the user, the one that made the change
  included; a deleted account ends its sessions; the role is re-read at every
  check. A failed lookup means no session. See `SECURITY.md`.
- A Google sign-in marks the e-mail verified only when Google's ID token has
  `email_verified: true` for the address stored on the user, for a new user
  at the first sign-in too. It was marked on every Google sign-in of an
  existing user, whatever Google reported, also on a refused sign-in. The
  order in which Auth.js calls the callbacks was read in the source of
  `@auth/core` 0.41.3, not measured against Google. See `SECURITY.md`.
- No plain-text password stays in memory after a command: the command
  history, undo and redo (which nothing called) are removed.
- `BCRYPT_ROUNDS` now applies to every path of the application that stores a
  password (adding a password to a Google account and
  `UserRepository.update()` used a fixed cost of 12). The seed,
  `pnpm create-user` and the E2E fixtures still hash at a fixed cost of 12.
- An unexpected failure in registration or password change answers a fixed
  generic message; the internal error's message is no longer sent to the
  client.
- The in-memory audit log of the command bus keeps the newest 1,000 entries;
  it grew without limit.

### 🔧 Changed

- After a password change the account page signs out and the message asks to
  sign in again.
- Deleting the account answers an error when the user row was not deleted; it
  answered "deleted" before.
- `IUserRepository.updatePassword` takes a third, required argument
  `{ revokeSessions: boolean }`: a call written for v2.1.0, with two
  arguments, no longer compiles. `UserRepository.update()` with a password
  ends the user's sessions too. The `PasswordChangedEvent` published after a
  password change carries `requiresLogout: true` (it was `false`).
- The callback parameter types in `src/types/next-auth.d.ts` resolved to
  `any`; the missing type imports are added, and a compile-time test fails
  `pnpm typecheck` when one of them is `any` again.

### 🗑️ Removed

- Dead code, 4,162 lines deleted (nothing imported or called them): two error
  components, seven test-support files, unused entries of the error factory
  with their classes, ten two-factor helpers and smaller leftovers, among
  them `useMultipleFormReset`, `createRequestLogger`, `measurePerformance`,
  `getRepositories` and `BaseEvent.fromJSON` (the full list is in the commit
  history). No runtime change.
- The command history with undo and redo: `commandBus.undo()`, `redo()`,
  `getHistory()` and `clearHistory()`, `CommandHistory`, the bus options
  `enableHistory` and `maxHistorySize`, `ICommand.canUndo` / `undo` / `redo`
  and `CommandUndoneEvent`. `BaseCommand.logExecution()` no longer takes the
  input and `logSuccess()` no longer takes the output: a command written for
  v2.1.0 that passes them no longer compiles.
- Five types of `src/types/next-auth.d.ts` that nothing used
  (`SignOutEventMessage`, `CreateUserEventMessage`, `LinkAccountEventMessage`,
  `SessionEventMessage`, `SignInCallbackParams`).

### ⬆️ Upgrading a database from v2.1.0

- Run `pnpm prisma:push` **before** starting the new code: new table
  `RevokedSession`, new column `User.sessionVersion`. Without the table every
  session check fails closed (nobody is signed in). For a restricted database
  user see `docs/DEPLOYMENT.md`.
- A clone that already has the test database needs the new schema there as
  well: `pnpm db:push:test`. The integration file and the E2E setup use the
  new table (read in the source, not measured).
- Every user signs in once: session tokens issued by an earlier version are
  refused. Auth.js logs a `JWTSessionError` at error level when a session
  check meets a refused token (see `SECURITY.md`).

### 🧪 Tests

- Jest: 721 tests (was 467). Playwright: 88 tests (was 82).
- The E2E suite requests every route it visits before the first test, so
  that `next dev` compiles them there, and fails the run when the dev server
  compiles while tests are running.
- The unit suite fails on dead code (a module nothing reaches, an export
  nothing mentions).
- Coverage no longer counts the generated Prisma client: 43 % of statements
  (the same run with the client counted, as before: 9 %).
- CI: the GitHub Actions run on their Node 24 majors.

## [v2.1.0] - 2026-10-01

### ✨ Features

- The sign-in method used last is remembered on every successful sign-in and
  shown as a "Last used" badge: on the account page, and on the sign-in page
  when Google is configured (two options to choose from). The sign-in page
  reads it from a cookie that holds only the method name (see `SECURITY.md`).

### 🔧 Changed

- `User.primaryAuthMethod` is replaced by `User.lastLoginMethod`
  (`credentials` or `google`). The old column was written at the first
  sign-in and never updated, and the account page showed a separately computed
  value; there is now one source. `/api/account/info` returns
  `lastLoginMethod` instead of `primaryAuthMethod`.
- The account page no longer shows the "Primary" and "Backup" badges.
- Unlinking Google clears `lastLoginMethod` if Google was the method used last.

### ⬆️ Upgrading a database from v2.0.0

- The schema drops a column. `pnpm prisma:push` refuses when a row still has
  a value in `primaryAuthMethod`; in that case run this once:
  `pnpm exec prisma db push --accept-data-loss`.
  A new database needs nothing.

### 🧪 Tests

- Jest: 467 tests (was 431). Playwright: 82 tests (was 79).

## [v2.0.0] - 2026-10-01

Security and accuracy pass after a code audit (details in the commit history
and in `SECURITY.md`).

### 🔒 Security

- Dependencies patched: `pnpm audit` 0 advisories (was 105, 54 in production
  dependencies, incl. the Next.js RSC / Server Actions and image-optimizer
  RCEs, the middleware authorization bypass and the next-auth `auth()`
  fail-open)
- `ENCRYPTION_KEY` required everywhere (no fallback key); example secrets
  refused in production
- Database-backed account lockout; sign-in throttling per e-mail **and** IP
  (IPv6 addresses were ignored before)
- TOTP ±30 s window actually applied (it was 0)
- Sessions: 7-day idle timeout by default (`SESSION_MAX_AGE`)
- Server auth code no longer shipped to the browser (CI check)
- Account security state never cached or invented on errors; bounded
  web-vitals store; `/api/health` no longer echoes database errors nor reports
  healthy servers as unhealthy; dev mock-session endpoint removed
- A session secret is required in every environment; the E2E run can no
  longer wipe the development database

### 🧪 Tests

- Playwright suite rewritten so every test can fail (79 tests); Jest grows
  from 292 to 431 tests for the security changes
- The Playwright suite runs in CI (`e2e` job) with Playwright retries off;
  the helpers' silent retry of session requests is gone

### 🧹 Types

- No explicit `any` is left in `src/` and `scripts/` (160 removed); the lint
  rule is now an error
- `/api/account/info`: for a user with both a password and Google,
  `primaryAuthMethod` no longer compares against a column that does not
  exist; the answer is unchanged (`email`)

### 📝 Docs

- README, SECURITY.md and docs/ checked claim by claim against the code;
  demo content and limitations stated explicitly

### ⚠️ Breaking

- Without a valid `ENCRYPTION_KEY` the app is not served in any environment
  (start-up validation). 2FA secrets encrypted with the old development fallback cannot
  be decrypted: affected users must enroll again.
- Google sign-in is offered only when both Google variables are set.

## [v1.1.0] - 2025-08-01

### ✨ Features

- Upgraded TailwindCSS from v3.4.16 → v4.1.11
- Updated `postcss.config.js` to use `@tailwindcss/postcss`
- Migrated `globals.css` to new `@import` syntax
- Refactored styling using `@layer` instead of legacy `@apply`
- Replaced deprecated `@types/bcryptjs` with native types

### 🔧 Dependency Upgrades

- TypeScript: 5.8.3 → 5.9.2
- PostCSS: 8.4.49 → 8.5.6
- Autoprefixer: 10.4.20 → 10.4.21
- Lucide React: 0.535.0 → 0.536.0

### 🛠 Fixes

- Resolved issues with `searchParams` typing in Next.js 15
- Ensured backward compatibility with previous CSS structure

### 🧪 QA

- Build verified (dev + prod)
- Linting & TypeScript checks passing
- i18n rendering and form UX validated

---
