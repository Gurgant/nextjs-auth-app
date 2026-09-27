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
(your development data). See `e2e/support/test-db.ts`.

Playwright starts the dev server itself, or reuses one already listening on
`:3000` — in that case make sure it was started with the **same test
database**:

```bash
DATABASE_URL="postgresql://postgres:postgres123@127.0.0.1:5433/nextjs_auth_db" pnpm dev
```

The fixture user with 2FA has its TOTP secret encrypted with your
`ENCRYPTION_KEY`, read from `.env` (or the shell).

> ⚠️ Never start the dev server with `NODE_ENV=test`: the production
> Content-Security-Policy would be served (no `'unsafe-eval'`), which silently
> breaks hydration under `next dev` — pages render but nothing is clickable.

### How the E2E suite is written

- Specs live in `e2e/tests/*.e2e.ts` on top of one small helper module,
  `e2e/support/app.ts`. Every helper either reaches the state it promises or
  fails; nothing swallows an error (session and provider requests are retried
  only on a transport error, never on a response).
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
  be refused). The counters live in the dev server's memory: with a dev server
  you keep running between runs, they can carry over — restart it (or let
  Playwright start a fresh one) if sign-up tests start failing with "Too many
  sign-up attempts".

A mutation check was run on the rewritten suite: disabling 2FA enforcement in
`authorize()`, hiding the invalid-credentials alert, or removing the role
redirect on `/dashboard/pro` each makes the corresponding tests fail.
