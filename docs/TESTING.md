# Testing

Three layers. The numbers below were measured on 2026-10-03; run the commands
to check them yourself.

| Layer       | Runner                | Count | What it covers                                                            |
| ----------- | --------------------- | ----- | ------------------------------------------------------------------------- |
| Unit        | Jest (jsdom / node)   | 825   | lib, hooks, components, actions, API route handlers                       |
| Integration | Jest + test DB        | 24    | UserRepository, registration, lockout, session checks on real PostgreSQL  |
| End-to-end  | Playwright (Chromium) | 90    | sign-in, 2FA, registration, RBAC, i18n, session endings in a real browser |

## Prerequisites

```bash
pnpm docker:up        # dev + test databases
pnpm db:push:test     # schema on the test DB (port 5433)
```

## Unit + integration (Jest)

```bash
pnpm test             # every Jest suite (849 tests) — the integration file needs the test DB
pnpm test:unit        # everything except the real-DB integration file (825) — no DB
pnpm test:integration # the real-DB integration file only (port 5433)
pnpm test:coverage    # with a coverage report
```

The integration file connects through `src/lib/prisma-test.ts`, which uses
`DATABASE_URL` **only if it contains `5433`** and otherwise falls back to
`127.0.0.1:5433`. If your test DB runs on another port, keep `5433` in the
URL (e.g. `15433`) or adjust that file:

```bash
DATABASE_URL="postgresql://postgres:postgres123@127.0.0.1:15433/nextjs_auth_db" pnpm test
```

Coverage (measured): **56 % of statements** of the files matched by
`collectCoverageFrom` in `jest.config.js` — `src/` without `src/app/**` (pages
and route handlers), `src/middleware.ts`, `index.ts` barrels and the generated
Prisma client (`src/generated/**`, counted until v2.1.0, when it made up most
of the statements). The tests
concentrate on the authentication and security modules; large parts of the UI
have no unit tests. The error layer is tested by itself
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
  runs of three).
  - _Account-link gate - Real DB_ calls `linkAccount` on the adapter object
    that the application hands to Auth.js (`authOptions.adapter`): the one
    method through which Auth.js writes an `Account` row. A user with a
    password is refused without a grant and linked once with one; a grant is
    spent 299 999 ms after the password step and no longer at 300 000 ms,
    with the end compared by PostgreSQL; it is bound to its user and to its
    provider; the row of a first sign-in is linked without a grant, and
    three rows that differ from it in one condition each are refused; a
    second Google account is refused. A grant written in a transaction that
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
    (5 s); it is not a second attempt.
  - _Auth.js handleLoginOrRegister with the gated adapter - Real DB_ runs
    the function of `@auth/core` 0.41.3 that decides what a returning Google
    sign-in becomes, as it is installed, with that adapter, and with the
    app's session check (`createVerifiedDecode`) over a decode that reads
    JSON instead of an encrypted token. A new visitor is created and linked;
    a returning Google user signs in; the two refusals of Auth.js itself
    (`OAuthAccountNotLinked`) leave a live grant unspent; a session links
    after the password step and is refused without it; an account that signs
    in with Google only is refused a second Google account; a signed-out
    session counts as none. Three more cases give that function what a kit
    user might add. With the provider option
    `allowDangerousEmailAccountLinking` a visitor without a session is not
    linked to the user of the same e-mail address when that user has a
    password, an `Account` row or a verified e-mail (one test for each). A
    row with none of the three answers `OAuthAccountNotLinked` without the
    option and is linked without a grant with it. A `createUser` event that
    marks the new user verified makes a first sign-in fail, and the row it
    leaves behind then answers `OAuthAccountNotLinked`.
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
  the nine files that these statements, and the ones in `SECURITY.md`, were
  read from. It says nothing about behaviour: it fails when a file is no
  longer the file that was read, and names what that file is relied on for.
  One of its tests changes a recorded version and a recorded hash and
  expects both to be reported.
- **Unit tests** cover the rest in isolation: the wiring (the adapter of
  `authOptions` is the gate; `/api/auth/[...nextauth]` exports the wrapped
  handlers for GET and POST), the shape of the two statements of a grant,
  the gate's decisions case by case, the wrapper that chooses the refusal
  page, the two link routes with their codes, and the account page's text
  for every code.
- **E2E** (`e2e/tests/account-linking.e2e.ts`): the real route writes the
  grant into the database and links nothing; the address a refused link is
  sent to, opened directly, shows the refusal in Italian, by the
  `NEXT_LOCALE` cookie and by the browser language alone, and its button
  leads to the account page. It does not show that a refused Google callback
  arrives at that address.

A mutation check was run on 2026-10-05 on the unit and integration tests of
this change (262 tests in the twelve files that were run: 208 unit, 54
integration; without a change none of them failed). Each change was made
once and undone, and every one of them made tests fail:

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
  as they were. Before a test clicks the selector it waits for the session
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
- UI text that comes from `messages/*.json` is read from there. Strings that
  are hardcoded English in `src/` (the 2FA prompt, the dashboards and admin
  page, the language-selector label) are asserted as literals. So are, still,
  four answers of the registration and password-change actions
  (`auth-registration`, `terms-validation` and `session-revocation`): they
  were hardcoded when those specs were written and are now the English texts
  of `Errors` and `Success` in `messages/en.json`, word for word.
- The suite works with and without Google configured (it asks
  `/api/auth/providers`) and never clicks the Google button.
- 2FA tests generate real TOTP codes with `otplib`; nothing is mocked at the
  browser boundary.
- Rate-limit budget: one full run performs 5 registrations, 4 failed
  sign-ins and 1 password change, inside the limits (registration: 5 per hour
  per IP; the 6th would be refused). The counters live in the dev server's
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
  `e2e/support/warm-up.ts`: fourteen requests, one per dev-server entry (the
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
