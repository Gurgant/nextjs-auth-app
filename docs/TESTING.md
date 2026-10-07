# Testing

Three layers. The numbers below were measured on 2026-10-06; run the commands
to check them yourself.

| Layer       | Runner                | Count | What it covers                                                                      |
| ----------- | --------------------- | ----- | ----------------------------------------------------------------------------------- |
| Unit        | Jest (jsdom / node)   | 1714  | lib, hooks, components, actions, API route handlers                                 |
| Integration | Jest + test DB        | 53    | UserRepository, registration, lockout, session checks, link gate on real PostgreSQL |
| End-to-end  | Playwright (Chromium) | 117   | sign-in, 2FA, registration, RBAC, i18n, session endings in a real browser           |

## Prerequisites

```bash
pnpm docker:up        # dev + test databases
pnpm db:push:test     # schema on the test DB (port 5433)
```

## Unit + integration (Jest)

```bash
pnpm test             # every Jest suite (1767 tests) — the integration file needs the test DB
pnpm test:unit        # everything except the real-DB integration file (1714) — no DB
pnpm test:integration # the real-DB integration file only (53, port 5433)
pnpm test:coverage    # with a coverage report
```

The integration file connects through `src/lib/prisma-test.ts`, which uses
`DATABASE_URL` **only if it contains `5433`**. Any other `DATABASE_URL` is
set aside for the docker test database on `127.0.0.1:5433`, and the module
prints which database it does not use and which one it uses instead (host,
port and database name, without the credentials). The substitution is the
safety device: the integration file deletes every row of the tables it uses,
and under Jest the variable is the one of `.env` when the shell names none
(measured: a Jest test started without `DATABASE_URL` in the shell sees
one). With the `.env` of the Quick Start (port 5432) that is the development
database, which the rule sets aside. The rule looks at nothing but the text
`5433`: a development database whose URL contains it is taken for a test
database, so keep yours off such a port. The rule is unit-tested
(`src/lib/__tests__/prisma-test.test.ts`), also for the second client that
three tests of the integration file open (`openSecondPrismaTestClient`): it
connects to the database the rule chose, with a connection pool of its own.
If your test DB runs on another port, keep `5433` in the URL (e.g. `15433`)
or adjust that file:

```bash
DATABASE_URL="postgresql://postgres:postgres123@127.0.0.1:15433/nextjs_auth_db" pnpm test
```

`src/test/hybrid/__tests__/auth.hybrid.test.ts` runs the registration
command on a repository that the test file writes itself, over a mocked
Prisma client or over the test database. `pnpm test` and `pnpm test:unit` run
it in mock mode. `pnpm test:hybrid:real` (and `pnpm test:all:real`) run it
against the docker test database on port 5433, through the same
`src/lib/prisma-test.ts`, and add the one test that a mock cannot give: the
unique index on `User.email`. No job of the CI workflow runs the real mode.
Measured on 2026-10-05 with `TEST_MODE=real` and a `DATABASE_URL` on port
15433: every test of the file passed.

Coverage (measured on 2026-10-06 with `pnpm test:coverage` and the test
database, five times: 80.02 % four times and 80.09 % once): **80 % of
statements** of the files matched by `collectCoverageFrom` in `jest.config.js` — `src/`
without `src/app/**` (pages and route handlers), `src/middleware.ts`,
`index.ts` barrels and the generated Prisma client (`src/generated/**`,
counted until v2.1.0, when it made up most of the statements). The runs
differ in two lines of `src/lib/security.ts`, the `catch` of `decrypt()`,
which one run reached and the others did not: one test decrypts with
another key and accepts an error as well as a text that is not the secret,
and that decryption throws in about one case in eight (measured outside the
suite with the same calls of the library: 519 of 4000). The tests
concentrate on the authentication and security modules (`src/lib/auth` 97 %,
`src/lib/actions` 84 %). Of the components, `src/components/auth` is at
75 % and `src/components/security` at 48 %: a unit test
takes the sign-in form (`credentials-form.tsx`) through its 2FA step only (a
refused password and a request that throws are not submitted), and none
runs the account page wrapper (0 %). The six route handlers have a unit test file each, and nine
of the twelve pages under `src/app` are rendered by a unit test (not the
registration page, the account page and the `/dashboard` redirect); they
are outside this figure. The
error layer is tested by itself
(`src/lib/errors/__tests__/error-layer.test.ts`). The events layer is tested
with its real bus and listeners (`src/lib/events/__tests__/event-provider.test.ts`).
There is no coverage threshold.

### Account linking: what is measured and what is only read

Whether a Google account is linked to an existing user is decided on the
server (`src/lib/auth/link-gate.ts`; see `SECURITY.md`). No test completes a
Google sign-in, so the tests reach that decision from both sides and stop
where Google would be.

- **The integration file** has two groups for it, on real PostgreSQL
  (measured on 2026-10-05: 30 tests in the two groups; with `CI` set, which
  gives the shared client a pool of two connections, they passed in three
  runs of three; since 2026-10-06 the groups have 32 tests, with the two on
  what is stored of an account).
  - _Account-link gate - Real DB_ calls `linkAccount` on the adapter object
    that the application hands to Auth.js (`authOptions.adapter`): the one
    method through which Auth.js writes an `Account` row. A user with a
    password is refused without a grant and linked once with one; a grant is
    spent 299 999 ms after the password step and no longer at 300 000 ms,
    with the end compared by PostgreSQL; it is bound to its user and to its
    provider; the row of a first sign-in is linked without a grant, and
    three rows that differ from it in one condition each are refused; a
    second Google account is refused. What is stored: the adapter is handed
    the account with the seven values Auth.js takes from a token response
    (access, refresh and ID token, expiry, type, scope, session state), for
    a first sign-in and for a link with a grant, and each row is read back
    whole: it holds the user, the type, the provider and the account id, and
    `NULL` in the seven columns. A grant written in a transaction that
    fails does not stay on the row: the password step writes the grant and
    its event in one transaction, and the unit test of the route only models
    one. For a user id that no row has, the test does not count events (the
    foreign key refuses such a row, and a failed event write is kept
    silent): it looks for the logged failure of an attempt to write one.
  - Three of those tests **force an overlap**. In two, a second Prisma client
    (`openSecondPrismaTestClient` in `src/lib/prisma-test.ts`) locks the
    user's row, two calls are started on the shared client, and the lock is
    released only when `pg_stat_activity` shows both of them waiting for it.
    Run one after the other, two attempts would prove nothing about single
    use. The third shows a limit that `SECURITY.md` declares ("Not one
    transaction"): the second client holds every insert into `Account` back
    with a table lock; a link is started and seen waiting to write its row,
    a second grant is written and a second link started, and both Google
    accounts end up linked. The wait for each of these states is bounded
    (5 s); it is not a second attempt. Each of the three tests has a limit
    of 30 s in Jest, above its waits added up and above the 15 s that the
    transaction holding the lock is given: a wait that fails is reported
    with its own message, and the test gives its lock up and lets the calls
    it started end before the next test begins. Measured on 2026-10-05 by
    making the three tests wait for a state that cannot come. With Jest's
    default of 5 s, in the file as it was before the limit, all three were
    reported as "Exceeded timeout of 5000 ms for a test", never with the
    message of the wait, and links that the second and the third had started
    went on into the next test, where their events could not be written for
    a user that it had deleted (three runs, with 4, 3 and 4 such failures in
    the log). With the limit, all three were reported as "2 of 3 calls were
    waiting for the lock after 5 s", the test after them passed, and the log
    showed no such failure (two runs).
  - _Auth.js handleLoginOrRegister with the gated adapter - Real DB_ runs
    the function of `@auth/core` 0.41.3 that decides what a returning Google
    sign-in becomes, as it is installed, with that adapter, and with the
    app's session check (`createVerifiedDecode`) over a decode that reads
    JSON instead of an encrypted token. A new visitor is created and linked;
    a returning Google user signs in; the two refusals of Auth.js itself
    (`OAuthAccountNotLinked`) leave a live grant unspent; a session links
    after the password step and is refused without it; an account that signs
    in with Google only is refused a second Google account; a signed-out
    session counts as none. A new visitor and a link after the password
    step are also run with the seven values of a token response: Auth.js's
    own `linkAccount` event receives them (so the function had them), and
    the `Account` rows hold none. Three more cases give that function what
    a kit user might add. With the provider option
    `allowDangerousEmailAccountLinking` a visitor without a session is not
    linked to the user of the same e-mail address when that user has a
    password, an `Account` row or a verified e-mail (one test for each; none
    of the three users holds a grant, and the option is not tested with a
    live grant: see `SECURITY.md`). A row with none of the three answers
    `OAuthAccountNotLinked` without the option and is linked without a grant
    with it. A `createUser` event that marks the new user verified makes a
    first sign-in fail, and the row it leaves behind then answers
    `OAuthAccountNotLinked`.
- **`jest.config.js` lets two packages of Auth.js be transformed** for that
  group. `@auth/core` and `@auth/prisma-adapter` are ES modules, and
  `next/jest` transforms nothing under `node_modules` except the packages
  named in two patterns that it generates. The config adds the two packages
  to both patterns, and throws when `next/jest` no longer generates them.
  Measured before the change: loading `handle-login.js` of `@auth/core`
  failed with "SyntaxError: Cannot use import statement outside a module",
  and the adapter with "SyntaxError: Unexpected token 'export'"; with the
  change both load. `next.config.ts` and the build are not touched.
  `next-auth` and its providers are still replaced by stand-ins. `@auth/core`
  is no dependency of the project and exports no `./lib`: the test finds the
  file beside `next-auth`, through the real path of that package.
- **What that group does not run** is read in the source of `@auth/core`
  0.41.3 and not measured: the exchange with Google; that Auth.js wraps an
  error of the adapter into `AdapterError` and answers with a redirect that
  sets no session cookie; that the request context of the refusal page
  (`src/lib/auth/link-refusal.ts`) is still there when the gate runs.
  `src/test/unit/__tests__/authjs-source-pin.test.ts` records the versions
  of `next-auth`, `@auth/core` and `@auth/prisma-adapter` and the SHA-256 of
  the eleven files that these statements, the ones in `SECURITY.md` and the
  ones under "Return address" below were read from. It says nothing about
  behaviour: it fails when one of the three packages is installed in another
  version or a file is no longer the file that was read, and names what that
  file is relied on for. One of its tests changes a recorded version and a
  recorded hash and expects both to be reported. One statement rests on a
  search of the packages, which no hash of a file covers, and only the
  recorded versions make it due again: that Auth.js reads no stored token
  back. The search found one place where Auth.js asks its adapter for a
  stored `Account` row (`getAccount`, in `lib/utils/webauthn-utils.js` of
  `@auth/core`); it runs for a WebAuthn provider, and the application
  configures none.
- **Unit tests** cover the rest in isolation: the wiring (the adapter of
  `authOptions` is the gate; `/api/auth/[...nextauth]` exports the wrapped
  handlers for GET and POST), the shape of the two statements of a grant,
  the gate's decisions case by case, what the gate hands the adapter to
  store (the four values, in both cases that end in a link), the wrapper
  that chooses the refusal page, the two link routes with their codes, and
  the account page's text for every code.
- **E2E** (`e2e/tests/account-linking.e2e.ts`): the real route writes the
  grant into the database and links nothing; the address a refused link is
  sent to, opened directly, shows the refusal in Italian, by the
  `NEXT_LOCALE` cookie and by the browser language alone, and its button
  leads to the account page. It does not show that a refused Google callback
  arrives at that address.

A mutation check was run on 2026-10-05 on the unit and integration tests of
the link gate (262 tests in the twelve files that were run: 208 unit, 54
integration; without a change none of them failed). The integration file had
54 tests then and has 53 now: three tests of `UserRepository.findByCredentials`
went later, together with that method, which the application did not call,
and two tests on what is stored of an account came on 2026-10-06.
Each change was made once and undone, and every one of them made tests fail:

| Change                                                           | Failed tests (unit + integration)             |
| ---------------------------------------------------------------- | --------------------------------------------- |
| the gate returns instead of throwing                             | 10 + 17                                       |
| a first sign-in is any user without an `Account` row             | 2 + 5                                         |
| a first sign-in is any user without a password                   | 3 + 6                                         |
| a first sign-in may have a verified e-mail                       | 1 + 3                                         |
| no row is linked without a grant                                 | 1 + 4                                         |
| the gate does not look for an account of the provider            | 1 + 1                                         |
| the gate writes a refusal event for a user id that no row has    | 1 + 1                                         |
| the spend is a read followed by an unconditional write           | 14 + 2 (the two tests that overlap one grant) |
| the spend does not compare the end of the grant                  | 9 + 2                                         |
| the spend does not compare the provider                          | 9 + 1                                         |
| the grant is written outside the transaction it is handed        | 4 + 1                                         |
| the route writes no grant                                        | 2 + 0                                         |
| the route writes the grant before it checks the password         | 5 + 0                                         |
| the route writes the grant and its event without a transaction   | 3 + 0                                         |
| `authOptions.adapter` is the Prisma adapter without the gate     | 2 + 19                                        |
| `/api/auth/[...nextauth]` exports the handlers unwrapped         | 2 + 0                                         |
| `/api/auth/[...nextauth]` wraps GET only                         | 1 + 0                                         |
| the link routes accept any provider                              | 7 + 0                                         |
| the link routes do not check that the password is a string       | 10 + 0                                        |
| the account page shows the English `error` of the unlink route   | 12 + 0                                        |
| the sign-in page forwards `error` without encoding it            | 1 + 0                                         |
| the lock event of `authorize()` reads the `User-Agent` by itself | 1 + 0                                         |

A second check was run on 2026-10-06 on what the gate stores (the 22 unit
tests of `link-gate.test.ts` and `auth-config.link-gate.test.ts` and the 53
of the integration file; without a change none of them failed):

| Change                                                          | Failed tests (unit + integration) |
| --------------------------------------------------------------- | --------------------------------- |
| a first sign-in hands the adapter the account as it comes       | 3 + 2                             |
| a link after the password step hands it the account as it comes | 2 + 2                             |
| the access token is kept with the four values                   | 5 + 2                             |

Measured on 2026-10-06 with the code of 2.5.0, before that change: the two
integration tests on what is stored failed, and each found all seven values
of the token response in the row (51 of the 53 tests passed).

### Return address: what is measured and what is only read

After a sign-in, a link or a sign-out Auth.js sends the browser to the
address that the `redirect` callback of `src/lib/auth-config.ts` answers.
The rule is the same in every language: an address on this origin is kept
as it was asked for, with its query string and fragment, and anything else
becomes the base URL. An address that carries a user name or a password
counts as anything else. No test completes a Google sign-in, so the two
Google flows are measured up to the address Auth.js keeps for the return,
and read from there.

- **Unit** (`src/lib/__tests__/auth-config.redirect.test.ts`) calls the
  callback as a function: addresses on this origin, as a path and as an
  absolute URL; the account page and the home page of each of the five
  locales; and the addresses that have to become the base URL. Among those:
  another origin, an origin that only starts with the base URL
  (`https://app.example.evil.test`), the base URL as the user name of
  another host (`https://app.example@evil.test`), a protocol-relative
  address, backslashes in place of slashes, a tab or a line break between
  two slashes, another port or scheme of the same host, `javascript:`,
  `data:`, a `blob:` address of this origin, and this origin with a user
  name or a password before the host (`https://user:pw@app.example`). Three
  cases show that the answer is the address as the URL parser resolved it,
  not the text that was sent.
- **E2E** (`e2e/tests/return-address.e2e.ts`), two tests. In a browser, the
  Sign out button on the Spanish home ends the session and leaves the
  browser on `/es`. And the running Auth.js is asked ten times, through
  its sign-out endpoint and without a session, to return to an address:
  five on this origin, one under each locale (the English, the German and
  the Italian account page, a Spanish address with a query string and a
  fragment, the French home as an absolute URL) and five that are not (the
  base URL with a longer port, as a user name and as the start of a host
  name; `//evil.test`; `/\evil.test`). The test compares the `url` of each
  answer and the address Auth.js then holds in its callback-url cookie.
  Other specs show a sign-in with e-mail and password ending on the account
  page of its locale (`/en`, `/es`, `/fr`) and a sign-out ending on `/en`.
  The e-mail form goes to the account page itself (`router.push`). It names
  no address, so next-auth posts the address of the page the form is on,
  and of the callback's answer the form uses the `error` parameter, and
  `code` only when there is an `error`: next-auth reads both from the
  answer's query string (`react.js`), and the form takes a sign-in whose
  answer has an `error` for a refused one (`if (res?.error)`). So when the address of the page carries `?error=`
  itself, an accepted sign-in is not followed by the move to the account
  page (measured, below).
- **Read, not measured**: the two Google flows. "Sign in with Google" and
  the link of the account page both ask for `/{locale}/account`. That the
  browser arrives there rests on what was read in the source of next-auth
  5.0.0-beta.32 and `@auth/core` 0.41.3: `signIn()` posts that address as
  `callbackUrl` (`react.js`); Auth.js passes it through the callback and
  keeps the answer in the callback-url cookie (`lib/init.js`,
  `lib/utils/callback-url.js`; the E2E test measures this step, at the
  sign-out endpoint); when Google returns, the request names no address, so
  Auth.js asks the callback with the one of the cookie and redirects to its
  answer (`lib/actions/callback/index.js`). The four files are among the
  eleven of the source pin (see "Account linking").

Measured on 2026-10-06 with the code of 2.5.0, before the rule was changed:

- As a function (the 56 cases of the unit test above, against the callback
  of 2.5.0): 26 failed. `/en/account` was answered with `/en`, and so were
  the two addresses of the test that contain `/signout` and `/auth/signin`,
  under the Italian and the French locale.
  `https://app.example.evil.test/account`,
  `https://app.example@evil.test/account` and
  `https://app.example:8443/account` were answered as they were sent.
- At the running Auth.js (the E2E test above, which did not ask for the
  Italian account page then): `/en/account` was answered with
  `http://localhost:3000/en`, the three other addresses of this origin as
  they were asked for, and `http://localhost:30000/account`,
  `http://localhost:3000@evil.test/account` and
  `http://localhost:3000.evil.test/account` as they were sent, each with
  that address in the callback-url cookie. With the last of them in the
  cookie, the next request to Auth.js was answered 500 (`InvalidCallbackUrl`
  in the log), and the test ended there.
- In a browser, with a spec that was not kept, under English and under
  German: a sign-out ended on the home page of the locale, the deletion of
  the account as well, and a sign-in with e-mail and password on its
  account page. The Spanish sign-out test above passed on that code too.
- The e-mail form on a home address that carries `?error=x`, in a browser,
  with a second spec that was not kept and a valid password. Under `/de`
  and `/es` Auth.js answered with the address of the page, the user was
  signed in, and the browser stayed on that address: it showed the
  signed-in home and no alert. Under `/en` Auth.js answered with `/en`, and
  the browser went on to `/en/account`. From `/en` and from `/en?code=x` it
  reached `/en/account` as well.
- The sign-out page of Auth.js itself, with the same spec. The application
  serves it at `/api/auth/signout` (it configures no `pages.signOut`). A
  signed-in user opened it with
  `callbackUrl=http://localhost:3000@evil.test/landing`: Auth.js kept that
  address in its callback-url cookie, and a sign-out sent without a browser
  was answered with status 302 and that address as `Location`. In the
  browser of the E2E suite (Chromium) the "Sign out" button ended the
  session and the browser stayed on that page: the console said "Refused to
  send form data" for the directive `form-action 'self'` of the
  Content-Security-Policy, which `next.config.ts` sets on every response. A
  browser that does not apply that directive to a redirect was not
  measured.

The same spec on the changed code: under `/en?error=x`, `/de?error=x` and
`/es?error=x` alike the e-mail form signed the user in and the browser
stayed on the address of the page, and from `/en` and from `/en?code=x` it
reached `/en/account`. On the sign-out page the cookie held the base URL,
the click was answered with a redirect to it, and the browser ended on
`/en`, signed out.

So the landing pages that change are those of the two Google flows under
the English locale (the account page instead of the home page; read, not
measured); of the e-mail form on an English home address that carries
`?error=` (the home page, signed in, instead of the account page: what the
other locales already did; a search of `src/` finds no link to a home
address with that parameter); and of whatever asks Auth.js for an address
that the old rule rewrote or let through.

An address of this origin with a user name or a password before the host
leads to no other host: the callback refuses it for what the page then
does. Measured on 2026-10-06 in the same browser and with the same spec,
on the callback as it was before it refused such an address: asked through
the sign-out page to return to `http://user:pw@localhost:3000/en`, Auth.js
kept that address in the cookie and redirected to it, the browser opened
the page under it, and there `fetch("/api/auth/session")` threw a
`TypeError` ("Request cannot be constructed from a URL that includes
credentials"); on `/en` opened without them the same request was answered
with status 200. With the rule, the same steps ended on `/en` and the
request was answered with status 200. Not measured: another browser, and
what the application's own requests do on a page opened with a user name in
its address.

A mutation check was run on 2026-10-06 on the callback (the 56 cases of the
unit test; each change made once and undone):

| Change                                                              | Failed tests                    |
| ------------------------------------------------------------------- | ------------------------------- |
| a comparison of text (`startsWith`) in place of the URL parser      | 15                              |
| the default `redirect` callback of `@auth/core` 0.41.3              | 18                              |
| `origin` compared in place of scheme, host and port                 | 1 (the `blob:` address)         |
| the text that was sent is answered in place of the resolved address | 21                              |
| an address with a user name or a password is kept                   | 4                               |
| only the user name is looked at                                     | 1 (a password and no user name) |
| only the password is looked at                                      | 1 (a user name and no password) |

## End-to-end (Playwright)

```bash
pnpm exec playwright install chromium   # once, downloads the browser
pnpm test:e2e                           # runs the suite against the test DB
```

The run uses **one** database for everything — the global setup (which
recreates the fixture users), the dev server it starts, and the teardown
(which deletes all rows): the `DATABASE_URL` you pass in the shell, or the
docker test DB on port 5433. It never uses the `DATABASE_URL` from `.env`,
and it **refuses to start** if the chosen database is the one `.env` points at
(your development data; compared by host, port and database name). See
`e2e/support/test-db.ts`.

Playwright starts its own dev server. If something already listens on
`:3000` it stops with an error instead of reusing it (a `pnpm dev` you started
reads `.env` and would point the app at your development data). To reuse a
server on purpose — faster when iterating — start it on the **same test
database** and opt in:

```bash
DATABASE_URL="postgresql://postgres:postgres123@127.0.0.1:5433/nextjs_auth_db" pnpm dev
E2E_REUSE_SERVER=1 pnpm test:e2e
```

The fixture user with 2FA has its TOTP secret encrypted with your
`ENCRYPTION_KEY`, read from `.env` (or the shell).

> ⚠️ Never start the dev server with `NODE_ENV=test`: the production
> Content-Security-Policy would be served (no `'unsafe-eval'`), which silently
> breaks hydration under `next dev` — pages render but nothing is clickable.

### How the E2E suite is written

- Specs live in `e2e/tests/*.e2e.ts` on top of two small helper modules:
  `e2e/support/app.ts` and, for specs that change a user in the database,
  `e2e/support/db.ts`. Every helper either reaches the state it promises or
  fails; nothing swallows an error and no request is retried.
- API requests go through `apiGet` / `apiPost`, which send
  `Connection: close`. Playwright's request client keeps connections alive and
  `next dev` closes an idle one after about 6 s; a request sent on that socket
  at that moment fails with `ECONNRESET`. Measured against `next dev`, after
  an idle gap of 5.985–6.045 s: 14 of 260 requests failed by default, 0 of 260
  with `Connection: close`. Without connection reuse there is nothing to
  retry; an earlier helper that silently repeated such a request is gone.
- The sign-out tests first wait for the signed-out page, then ask the
  server. That order used to be a rule: every session request that carries a
  valid cookie gets it re-issued, so a response still in flight when the
  sign-out completes can put a cookie back, and that cookie used to be valid.
  Now it is the cookie of an ended session and the server refuses it.
  Measured over 20 repetitions with the session poll right after the click:
  4 failures when the rule was written (0 with the wait first); on
  2026-10-02, 8 failures on the code before sessions could be revoked and 0
  on the code after. In 6 of those 20 passing repetitions the server log
  shows a refused token of the ended session: a token of that session reached
  the server after the sign-out (a late cookie, or a request sent before the
  sign-out answered) and was refused.
- `session-revocation.e2e.ts` tests that race without timing, in both orders:
  a session request that reaches the server after the sign-out, and a
  response that was issued before it and is put into the browser after it.
  The helper for both is `cookieJarCopy`: a request client with its own
  cookie jar, filled with the cookies the browser holds at that moment, so
  what the browser does afterwards does not reach it. `signOutViaApi` signs
  out through the endpoint the button calls. Tests that change or delete a
  user create their own with `createTestUser` (`e2e/support/db.ts`, straight
  into the test database), so the seeded users stay as the other specs
  expect them.
- `language-selector.e2e.ts` changes the language through the selector of
  the navigation bar, page by page, and expects the same address under the
  other locale, query string and fragment included. Its first test compares
  the pages that the file names with the page files under
  `src/app/[locale]`, so a page that is added later fails the suite until it
  is named there. Two pages have no ordinary case. `/dashboard` is never
  shown: the server answers it with a redirect. The sign-in page replaces
  itself with the home page once it is hydrated, so a click on its selector
  races that; its test holds back the requests that the router sends in
  order to leave, as a slow connection would, and checks that the page asked
  to leave under both locales before it lets the requests go. The e-mail
  verification page has two cases: a token that no row has, and the token of
  a user that the test creates for itself (`createEmailVerificationToken` in
  `e2e/support/db.ts`). The page uses a token up while it renders, and the
  selector requests the same address again, so the second case expects what
  that visitor reads: the success text in the first language, then, in the
  chosen one and once more after a reload, that the address is already
  verified, while the verification date, the `updatedAt` of the user row and
  the one `email_verified` event of the first request stay in the database
  as they were. On both screens the test also reads where the two links
  lead: "Go to Dashboard" to `/{locale}/dashboard` and "Manage Account" to
  the account page. Before a test clicks the selector it waits for the session
  request of the layout's session provider: the selector's button is
  server-rendered, and a click before hydration does nothing. That the
  request is sent from an effect was read in the source of next-auth
  5.0.0-beta.32 (`react.js`: `SessionProvider` asks for the session in an
  effect when it gets no `session` prop) and not measured. Measured with
  that wait removed and `page.goto` returning at the committed response: 8
  of the 9 browser tests that the file had then failed at the closed
  selector.
- What remains are bounded waits for a state, not second attempts at an
  assertion: `expect.poll` on the session endpoint, on a request counter, on
  the `NEXT_LOCALE` cookie and on the requests that the sign-in test of
  `language-selector.e2e.ts` holds back, and one `toPass` loop that re-ticks
  the terms checkbox until the form is hydrated
  (`terms-validation.e2e.ts`); the behaviour under test is asserted after
  it, once. Before the first test there is one more bounded wait, the
  warm-up of the global setup (see below).
- Assertions are web-first (`toBeVisible`, `toHaveText`, `toHaveURL`) and the
  session endpoint is the source of truth for signed-in / signed-out.
- UI text that comes from `messages/*.json` is read from there, and so is
  what the registration and password-change actions answer (the `Errors` and
  `Success` namespaces; `auth-registration`, `terms-validation` and
  `session-revocation`). Strings that are hardcoded English in `src/` (the
  dashboards and admin page, the language-selector label) are asserted as
  literals. The code step of the sign-in form is opened under `/en` and
  under `/de` (`auth-login`): its label, hint and button are read from the
  message files, and the German page is searched for the English ones. Its
  backup-code field is opened under `/en` and under `/fr` in the same way
  (`backup-code`). A text that holds rich-text tags
  (`Registration.agreeToTerms`) is compared as the page shows it, without
  them (`plainText` and `taggedText` in `e2e/support/app.ts`).
- `legal-pages.e2e.ts` follows the two links of the terms sentence of the
  registration form, under `/en` and under `/de`: each opens its placeholder
  page in a new tab that has no `window.opener`, the form keeps what was
  typed, and the checkbox stays as it was, unticked for the first link and
  ticked for the second. It also opens both pages directly in the five
  locales, without a session, and at two phone widths (390 and 320 px),
  where the heading has to show the whole name of the document: the name
  is one long word in German, and the heading is a gradient clipped to its
  text, so a word that does not fit is cut off without sticking out.
- The home page gets from the layout whether Google is configured, so its
  first HTML is the page as it stays. Two tests of
  `translation-aware.e2e.ts` hold that: one opens the five home pages in a
  browser that runs no script and reads the sentence about the ways to sign
  in and the entry of this server (the e-mail form, or the chooser); the
  other counts the requests of a loaded page and finds one for the session
  and none for the provider list. Because the e-mail form is in the first
  HTML, no element of the page shows that React has taken over:
  `waitForSignedOutHome` waits for the session status of the page
  (`data-session-status`), which the server renders as `loading` and only
  the browser's own session request turns into `unauthenticated`. A third
  test measures how the title of the home page wraps, in the five locales
  at 1280 px and at 390 px: the `<h1>` asks the browser for lines of even
  length (`text-wrap: balance`), and no title may end with one word alone
  on its last line. Measured on 2026-10-07 with the class taken away: at
  1280 px the Italian, the French and the German title ended with one word
  ("Benvenuto nella nostra / app"), at 390 px the English one ("Welcome to
  Our / App"), and the test failed. With the class the lines are
  "Benvenuto / nella nostra app", "Bienvenue dans / notre application",
  "Willkommen / in unserer App" and, at 390 px, "Welcome / to Our App"; the
  Spanish title fits one line at 1280 px (444 of 448 px). The two widths of
  the test are the only ones it holds. Measured once on 2026-10-07 at
  320 px, outside the suite: the French title takes three lines and ends
  with one word ("Bienvenue / dans notre / application"; "notre
  application" is wider than the line there), and the other four take two
  lines that end with two or three words.
- The suite works with and without Google configured (it asks
  `/api/auth/providers`) and never clicks the Google button.
- 2FA tests generate real TOTP codes with `otplib`; nothing is mocked at the
  browser boundary. `backup-code.e2e.ts` signs in with a backup code,
  against the real server and database: a user of the test's own has 2FA
  turned on in the database with three codes the test knows, encrypted as
  the application stores them (`enableTwoFactorInDatabase` in
  `e2e/support/db.ts`; turning it on through the account page would send
  the security alert). The code is typed in lower case with a space for the
  hyphen; the visitor lands signed in, the account page counts one code
  fewer and so does the row; the same code is then refused with the answer
  of a wrong code and no session, and the next code signs in.
  `two-factor-key-change.e2e.ts` gives a user of its own 2FA values written
  by another key than the server's, as they are after `ENCRYPTION_KEY` was
  changed, each chosen so that the server reads it as the empty text. The
  password with the six digits that `otplib` computes for the empty secret
  (through the form), with "-" as a backup code and with the user's own
  code (two hand-made requests) is answered as a wrong code each time, with
  no session, three failures counted on the row and no backup code used up.
  Measured on 2026-10-07 on the code before `validateTOTPCode` and
  `validateBackupCode` asked for a whole secret and a whole code: the first
  of the three signed in through the form and showed the account page.
- Rate-limit budget: one full run performs 5 registrations, 4 failed
  sign-ins and 1 password change, inside the limits (registration: 5 per hour
  per IP; the 6th would be refused). It also sends one wrong TOTP code, one
  used backup code and the three codes of the key-change test, each counted
  for its own account only (five failed codes in 15 minutes). The counters
  live in the dev server's
  memory: with a reused server (`E2E_REUSE_SERVER=1`) they can carry over
  between runs — restart it if sign-up tests start failing with "Too many
  sign-up attempts".

A mutation check was run on the rewritten suite: disabling 2FA enforcement in
`authorize()`, hiding the invalid-credentials alert, or removing the role
redirect on `/dashboard/pro` each makes the corresponding tests fail.

#### Warm-up and compile guard

`next dev` compiles a route the first time it is requested. Without a warm-up
the first test that reaches a route pays that compile inside one of its own
15 s or 20 s waits. Measured on 2026-10-02 on a development machine, before
the warm-up existed: 10 compiles inside tests, between 1.1 s and 7.6 s each
(nine routes for the first time, and `/[locale]/register` a second time).

- **Warm-up.** Before the first test, the global setup requests every route
  the suite visits, without a session and without following redirects, in two
  passes. The first pass makes `next dev` compile each route. The second pass
  sends the same requests again: the log then shows how long each compiled
  route takes to answer, and an entry that `next dev` dropped during a slow
  first pass is requested again. Neither pass checks whether a route was
  compiled; a compile in the second pass still comes before the first test.
  The routes are listed in one place only, `WARM_UP_ROUTES` in
  `e2e/support/warm-up.ts`: sixteen requests, one per dev-server entry (the
  locale is a parameter of the same entry, so `/en/...` is enough). The last
  one is for the page `next dev` serves when no page matches (the entry
  `/_not-found`): one spec opens the URL of a page that was removed. It is
  requested through a path that no page serves.
- The warm-up is a bounded wait, not a retry. Each request is sent once per
  pass, with 60 s for one request and 300 s for the whole warm-up, and each is
  logged with its status and its time. A request that gets no answer, a 404
  (the list is stale) or a 5xx (the route does not compile or crashes) fails
  the setup at once and names the route; nothing is repeated and no test runs.
  Any other status counts as answered: without a session the pages behind a
  sign-in answer 307 and `/api/account/info` answers 401, and it is the
  route's own code that gives that answer; the link route
  (`/api/auth/link-account/initiate`) exports only POST and answers the GET
  with 405, after `next dev` compiled it; the e-mail verification page is
  requested with a token that no row can have and answers 200 with its
  failure text. For the not-found entry the rule
  is the other way round: 404 is its answer, and any other status fails the
  setup, because then a page serves that path and the not-found page was not
  compiled. The warm-up asserts nothing about the app, and every test still
  runs once, with the same timeouts.
- **Compile guard.** `e2e/support/compile-guard.ts` is a Playwright reporter
  that reads the dev server's output. If `next dev` prints a "Compiled" line
  once the first test has begun, the run **fails** even when every test
  passed. The message lists what was compiled, in four groups (in GitHub
  Actions the same list is in the error annotation):
  - _route not in WARM_UP_ROUTES_: a spec visits a route that the warm-up does
    not request. Add it to the list.
  - _listed route not compiled by the warm-up_: a route of the list that no
    "Compiled" line named before the first test, so its request in the list
    did not make `next dev` compile it. Change that request. This group was
    not seen in a run; the guard is unit-tested for it.
  - _listed route compiled again_: a route of the list, compiled a second
    time. `next dev` drops an entry that was not requested for 60 s when
    another compile starts, and compiles it again on its next request. So one
    compile inside a test can be followed by others: deal with the other
    lines of the message first.
  - _"Compiled" line that names no route_: `next dev` prints one after a file
    of the working tree changed, and at times directly after a route compile
    with no file changed. When a route was compiled for the first time in
    the same run (one of the first two groups), the message says that the
    line can belong to it; otherwise it points to a file change, which is a
    compile too and so can be what listed routes compiled again follow from.
- **When the guard cannot see.** With `E2E_REUSE_SERVER=1` the output of the
  reused server does not reach Playwright; the guard prints that it is
  inactive in that run and changes nothing. Without that variable Playwright
  starts the server itself, so the output has to be there:
  - Output without any compile line before the tests fails the run instead
    of letting the guard pass blind. This is what happens when
    `stdout: "pipe"` is removed from `webServer` in `playwright.config.ts`
    (the server's error stream still arrives), and what would happen if
    `next dev` changed the wording of its compile lines.
  - No output at all fails the run when `CI` is set. Without `CI` the guard
    prints a notice with the possible causes.
  - Three limits, read in the source of next 15.5.26 and Playwright 1.55.1
    and not measured: a rebuild that ends with errors or warnings prints no
    "Compiled" line, so the guard does not see it; `--reporter=...` on the
    command line replaces the reporters of the config, the guard included;
    in UI mode (`pnpm test:e2e:ui`) the server's output goes to another
    reporter, so the guard prints the notice above.
- **Do not edit files in the working tree during a run**: no saves, no
  formatter, no `git checkout`. `next dev` rebuilds on every change, and a
  rebuild can reset the in-memory rate-limit counters (see
  [SECURITY.md](../SECURITY.md)). Measured earlier: edits during a run caused
  5 hot recompiles and one test failed. The guard fails such a run when the
  rebuild prints a "Compiled" line (see the limits above): its results are
  not trustworthy, so leave the files alone and run it again.
- **A machine busy with other test suites slows `next dev` compiles.**
  Measured: `/[locale]` took 11.2 s instead of about 3 s. The warm-up moves
  the compile time out of the tests; it does not make a slow machine fast. A
  page that is already compiled and still does not answer within a test's
  wait fails that test, as it should.

Measured on 2026-10-02 with the warm-up and the guard, on the same machine
(`CI=1 pnpm test:e2e`, three full runs), before the six tests of
`session-revocation.e2e.ts` were added (the suite had 82 tests then): 82
passed each time, and every
"Compiled" line of the dev server came before the first test (12, 13 and 12
lines, none after it). The warm-up took 33.5 s, 34.5 s and 29.9 s. The ten
requests were answered, in list order, with 200, 200, 200, 307, 401, 307, 200,
307, 307 and 307. In one of the three runs `next dev` printed one more
"Compiled" line, without a route, directly after it compiled `/[locale]/admin`
in the warm-up, although no file had changed; the cause was not determined.
While tests are running, the guard fails the run for such a line.

The guard was then made to fail on purpose (same day, `CI=1 pnpm test:e2e`,
followed by the spec file where one is named). In each of these runs every
test passed and the run ended with exit code 1:

- `/en/dashboard/pro` removed from `WARM_UP_ROUTES`, whole suite: 82 passed,
  one "Compiled" line after the first test, and the guard listed
  `route not in WARM_UP_ROUTES: /[locale]/dashboard/pro (1x)` and nothing
  else.
- The whole suite plus a temporary spec that sent no request for 70 s and
  then opened `/en/auth/error` (a page that was not in the list then): 83
  passed, six "Compiled" lines after the first test. The guard listed
  `/[locale]/auth/error` as not in the list, four listed routes compiled
  again (`/api/auth/[...nextauth]`, `/[locale]`, `/[locale]/account` and
  `/api/account/info`, once each) and one "Compiled" line that names no
  route. That line came directly after the compile of `/[locale]/auth/error`;
  no file had changed.
- A blank line added to `src/app/[locale]/page.tsx` and removed again 10 s
  later while `dashboard.e2e.ts` ran alone: 12 passed, and the guard listed
  two "Compiled" lines that name no route and pointed to a file change.
- `last-login-method.e2e.ts` alone (3 passed each time), with the server's
  output taken away in two ways. Without `stdout: "pipe"`: the run failed
  because the output had no compile line (`GITHUB_ACTIONS=true` was set for
  that run, and the guard printed its `::error` annotation). With a `name` on
  `webServer`, which changes the prefix of the server's lines: the run failed
  because no output was visible.

Two runs of the same spec file ended with exit code 0 and a notice from the
guard: the `webServer` `name` again, this time without `CI`, and a server
started beforehand with `pnpm dev` and reused with `E2E_REUSE_SERVER=1`.

Measured again on 2026-10-03, after the requests for
`/api/auth/link-account/initiate` and for the not-found page were added to the
list (`CI=1 pnpm test:e2e`, one full run on the same machine): every test
passed, all 14 "Compiled" lines of the dev server came before the first test,
and the warm-up took 36.0 s. The two new requests were answered with 405 and
404, the ten before them as on 2026-10-02.

Measured again on 2026-10-05, after the requests for `/en/auth/error` and for
the e-mail verification page were added to the list (`CI=1 pnpm test:e2e`,
two full runs on the same machine, which was busy with other work at the
time): every test passed both times, and every "Compiled" line of the dev
server came before the first test (28 and 26 lines). The first pass took
152.8 s and 104.1 s, more than the 60 s after which `next dev` drops an
entry, and the second pass compiled entries again (twelve and nine); nothing
was compiled while tests were running. The warm-up took 213.8 s and 141.2 s
of its 300 s. Playwright reported 18.3 and 13.9 minutes for the two runs;
with `CI` set, `globalTimeout` ends a run after 20. The two new requests were
answered with 200 and 200, the other twelve as on 2026-10-03. In the
second run `next dev` printed one "Compiled" line without a route during the
warm-up, directly after it compiled `/api/auth/[...nextauth]`; no file had
changed.

Measured again on 2026-10-06, with the 105 tests of 2.5.1 and the same
fourteen requests (`CI=1 pnpm test:e2e`, one full run on the same machine):
every test passed, all 16 "Compiled" lines of the dev server came before the
first test, and the fourteen requests were answered as on 2026-10-05. The
warm-up took 45.9 s, and Playwright reported 5.8 minutes for the run.

Measured again on 2026-10-06, with the 117 tests of 2.5.2 and sixteen
requests (the two placeholder pages are new): every test passed, all 18
"Compiled" lines of the dev server came before the first test, and the two
new requests were answered with 200 and 200. The warm-up took 52.8 s, and
Playwright reported 13.4 minutes for the run, on a machine that was busy
with other work.

### In CI

The `e2e` job of [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
runs the whole suite on every push to `main` and every pull request: Chromium,
one worker, `next dev`, a PostgreSQL 16 service container, Node 22 — the same
Node as the `checks` job.

**Playwright test retries are off** (`retries: 0` in `playwright.config.ts`,
locally and in CI) and the helpers retry no request: a test that passes only
on a second attempt is unstable and fails the job instead of being reported
as passed. The run stops by itself after 20 minutes (`globalTimeout`), before
the job's 30-minute limit. Both jobs are pinned to `ubuntu-24.04`: Playwright
1.55.1 has no Chromium build for a newer runner image.

Measured on 2026-10-01, before the warm-up and the compile guard were added
(`ubuntu-24.04`, Node 22.23.3,
[run 36907254274](https://github.com/Gurgant/nextjs-auth-app/actions/runs/36907254274)):
82 passed, 0 failed, 4.5 min for the Playwright run and 6 min 22 s for the
whole job, 70 s of which to install Chromium. One green run shows that the
job works; it does not prove that no test is unstable — the history of the
`e2e` job in the
[Actions tab](https://github.com/Gurgant/nextjs-auth-app/actions/workflows/ci.yml)
is the evidence for that.

The failure path was observed once on purpose, on a scratch branch with one
deliberately failing test
([run 36887638598](https://github.com/Gurgant/nextjs-auth-app/actions/runs/36887638598)):
the job ended as failed with `1 failed`, `79 passed` (the suite had 79 tests
then), the annotation pointed
at the failing line, and the `playwright-test-results` artifact (kept for 7
days) held the test's `trace.zip`, `test-failed-1.png`, `video.webm` and
`error-context.md`.
