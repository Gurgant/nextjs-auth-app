# Testing

Three layers. The numbers below were measured on 2026-10-01; run the commands
to check them yourself.

| Layer       | Runner                | Count | What it covers                                           |
| ----------- | --------------------- | ----- | -------------------------------------------------------- |
| Unit        | Jest (jsdom / node)   | 451   | lib, hooks, components, actions, API route handlers      |
| Integration | Jest + test DB        | 16    | UserRepository, registration, lockout on real PostgreSQL |
| End-to-end  | Playwright (Chromium) | 82    | sign-in, 2FA, registration, RBAC, i18n in a real browser |

## Prerequisites

```bash
pnpm docker:up        # dev + test databases
pnpm db:push:test     # schema on the test DB (port 5433)
```

## Unit + integration (Jest)

```bash
pnpm test             # every Jest suite (467 tests) — the integration file needs the test DB
pnpm test:unit        # everything except the real-DB integration file (451) — no DB
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

Coverage (measured): **8 % of statements** of the files matched by
`collectCoverageFrom` in `jest.config.js` — `src/` without `src/app/**` (pages
and route handlers), `src/middleware.ts` and `index.ts` barrels. The tests
concentrate on the authentication and security modules; large parts of the UI
and of the event / error infrastructure have no unit tests. There is no
coverage threshold.

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

- Specs live in `e2e/tests/*.e2e.ts` on top of one small helper module,
  `e2e/support/app.ts`. Every helper either reaches the state it promises or
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
  shows a refused token of the ended session: the late cookie did come back
  and did not sign the browser in.
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
- What remains are bounded waits for a state, not second attempts at an
  assertion: `expect.poll` on the session endpoint and on a request counter,
  and one `toPass` loop that re-ticks the terms checkbox until the form is
  hydrated (`terms-validation.e2e.ts`); the behaviour under test is asserted
  after it, once. Before the first test there is one more bounded wait, the
  warm-up of the global setup (see below).
- Assertions are web-first (`toBeVisible`, `toHaveText`, `toHaveURL`) and the
  session endpoint is the source of truth for signed-in / signed-out.
- UI text that comes from `messages/*.json` is read from there. Strings that
  are hardcoded English in `src/` (server-action messages, the 2FA prompt, the
  dashboards and admin page, the language-selector label) are asserted as
  literals.
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
  `e2e/support/warm-up.ts`: ten routes, one per dev-server entry (the locale
  is a parameter of the same entry, so `/en/...` is enough).
- The warm-up is a bounded wait, not a retry. Each request is sent once per
  pass, with 60 s for one request and 300 s for the whole warm-up, and each is
  logged with its status and its time. A request that gets no answer, a 404
  (the list is stale) or a 5xx (the route does not compile or crashes) fails
  the setup at once and names the route; nothing is repeated and no test runs.
  Any other status counts as answered: without a session the pages behind a
  sign-in answer 307 and `/api/account/info` answers 401, and it is the
  route's own code that gives that answer. The warm-up asserts nothing about
  the app, and every test still runs once, with the same timeouts.
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
(`CI=1 pnpm test:e2e`, three full runs): 82 passed each time, and every
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
  then opened `/en/auth/error` (a page that is not in the list): 83 passed,
  six "Compiled" lines after the first test. The guard listed
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
