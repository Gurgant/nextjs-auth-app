# Testing

Three layers. The numbers below were measured on 2026-09-27; run the commands
to check them yourself.

| Layer       | Runner                | Count | What it covers                                           |
| ----------- | --------------------- | ----- | -------------------------------------------------------- |
| Unit        | Jest (jsdom / node)   | 415   | lib, hooks, components, actions, API route handlers      |
| Integration | Jest + test DB        | 16    | UserRepository, registration, lockout on real PostgreSQL |
| End-to-end  | Playwright (Chromium) | 79    | sign-in, 2FA, registration, RBAC, i18n in a real browser |

## Prerequisites

```bash
pnpm docker:up        # dev + test databases
pnpm db:push:test     # schema on the test DB (port 5433)
```

## Unit + integration (Jest)

```bash
pnpm test             # every Jest suite (431 tests) — the integration file needs the test DB
pnpm test:unit        # everything except the real-DB integration file (415) — no DB
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
and of the command / event / error infrastructure have no unit tests. There is
no coverage threshold.

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
- A test never asks `/api/auth/session` while a sign-out it triggered in the
  browser is still in flight: every session request that carries a valid
  cookie gets it re-issued, so its late response can put the cookie back.
  The sign-out test first waits for the signed-out page, then asks the
  server. Measured over 20 repetitions: 4 failures with the session poll
  right after the click, 0 with the wait first.
- What remains are bounded waits for a state, not second attempts at an
  assertion: `expect.poll` on the session endpoint and on a request counter,
  and one `toPass` loop that re-ticks the terms checkbox until the form is
  hydrated (`terms-validation.e2e.ts`); the behaviour under test is asserted
  after it, once.
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
- Rate-limit budget: one full run performs 5 registrations and 4 failed
  sign-ins, inside the limits (registration: 5 per hour per IP; the 6th would
  be refused). The counters live in the dev server's memory: with a reused
  server (`E2E_REUSE_SERVER=1`) they can carry over between runs — restart it
  if sign-up tests start failing with "Too many sign-up attempts".

A mutation check was run on the rewritten suite: disabling 2FA enforcement in
`authorize()`, hiding the invalid-credentials alert, or removing the role
redirect on `/dashboard/pro` each makes the corresponding tests fail.

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

Measured on 2026-10-01 with this configuration (`ubuntu-24.04`, Node 22.23.3,
[run 36887540296](https://github.com/Gurgant/nextjs-auth-app/actions/runs/36887540296)):
79 passed, 0 failed, 4.3 min for the Playwright run and 6 min 7 s for the
whole job, 64 s of which to install Chromium. One green run shows that the
job works; it does not prove that no test is unstable — the history of the
`e2e` job in the
[Actions tab](https://github.com/Gurgant/nextjs-auth-app/actions/workflows/ci.yml)
is the evidence for that.

The failure path was observed once on purpose, on a scratch branch with one
deliberately failing test
([run 36887638598](https://github.com/Gurgant/nextjs-auth-app/actions/runs/36887638598)):
the job ended as failed with `1 failed`, `79 passed`, the annotation pointed
at the failing line, and the `playwright-test-results` artifact (kept for 7
days) held the test's `trace.zip`, `test-failed-1.png`, `video.webm` and
`error-context.md`.
