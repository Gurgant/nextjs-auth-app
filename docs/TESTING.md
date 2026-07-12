# Testing

Three layers. All counts below are real — run the commands to verify.

| Layer                | Runner                | What it covers                                    |
| -------------------- | --------------------- | ------------------------------------------------- |
| Unit                 | Jest (jsdom/node)     | lib utilities, hooks, components, actions         |
| Integration / hybrid | Jest + test DB        | repositories and auth flows against PostgreSQL    |
| End-to-end           | Playwright (Chromium) | login, registration, 2FA, RBAC, i18n in a browser |

## Prerequisites

```bash
pnpm docker:up        # dev + test databases
pnpm db:push:test     # schema on the test DB (port 5433)
```

## Unit + integration (Jest)

```bash
pnpm test             # full Jest suite
pnpm test:unit        # unit tests only
pnpm test:integration # repository/auth tests against the test DB
pnpm test:coverage    # with coverage report
```

Integration tests read `DATABASE_URL` from the script definition (test DB on
port 5433). If your test DB runs elsewhere, override it:

```bash
DATABASE_URL="postgresql://postgres:postgres123@127.0.0.1:15433/nextjs_auth_db" pnpm test
```

## End-to-end (Playwright)

```bash
npx playwright install chromium   # once, downloads the browser
pnpm test:e2e                     # runs the suite against the test DB
```

Playwright starts the dev server itself (see the `webServer` block in
`playwright.config.ts`) or reuses one already listening on `:3000` — in that
case make sure it was started with the **test** database:

```bash
DATABASE_URL="postgresql://postgres:postgres123@127.0.0.1:5433/nextjs_auth_db" pnpm dev
```

The E2E global setup seeds its own fixture users (including a 2FA-enabled one
whose TOTP secret is encrypted exactly like production data) and the global
teardown wipes the test DB afterwards.

> ⚠️ Never start the dev server with `NODE_ENV=test`: the production
> Content-Security-Policy would be served (no `'unsafe-eval'`), which silently
> breaks hydration under `next dev` — pages render but nothing is clickable.

## Conventions

- E2E specs live in `e2e/tests/*.e2e.ts` with page objects in `e2e/pages/`.
- Fixture users (`test@`, `admin@`, `prouser@`, `2fa@` … `@example.com`) are
  created by `e2e/global-setup.ts` — independent from the `pnpm db:seed`
  demo users, which target the development DB.
- 2FA tests generate real TOTP codes with `otplib` from the seeded secret;
  nothing is mocked at the browser boundary.
