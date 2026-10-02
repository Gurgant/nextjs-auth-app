# Deployment

This is a starter from a study project, not a hosted product — there is no
one-click deploy button. What follows is the minimum you need to take it to
production.

## Build & run

```bash
pnpm install
pnpm prisma:generate   # the client lives in src/generated/ (not committed, not generated on install)
pnpm build
pnpm start             # serve the production build (needs node_modules)
```

On Vercel or another CI, use `pnpm prisma:generate && pnpm build` as the build
command. The output is a regular Next.js build (no `output: "standalone"`). Anything
that runs Node 20+ and can reach PostgreSQL can host it: a VPS with a process
manager, a container platform, or Vercel with an external PostgreSQL (e.g.
Neon or Supabase). Note that on serverless or multi-instance hosting the
in-memory rate limits apply per instance (see `SECURITY.md`).

## Environment

Set the variables from `.env.example` with production values. When the server
starts it validates the configuration (`src/lib/env.ts`); if something is
wrong it serves nothing — every request fails — and logs the names of the
offending variables (measured with `next start`). In production that means:

- `DATABASE_URL` — PostgreSQL, preferably with TLS (`sslmode=require`)
- `ENCRYPTION_KEY` — exactly 64 hex characters: `openssl rand -hex 32`
- `AUTH_SECRET` (or `NEXTAUTH_SECRET`), ≥ 32 characters:
  `openssl rand -base64 32`
- the published example secrets are refused: the `.env.example` / CI values
  of `AUTH_SECRET`, `NEXTAUTH_SECRET` and `ENCRYPTION_KEY`, and the
  `RESEND_API_KEY` placeholders; other example values (such as the local
  database password) are not checked

Not enforced, but needed in practice:

- `NEXTAUTH_URL` — your `https://` origin (validated as https when set);
  e-mail links are built from it and fall back to `http://localhost:3000`
- `RESEND_API_KEY` — while it is unset, e-mail sending is **simulated**
  (logged, reported as sent) even in production
- `EMAIL_FROM` — a sender on a domain verified in Resend; the default
  `noreply@authapp.com` will be rejected

Validation runs when the server initialises (at start-up under `next dev`, on
the first request under `next start`), never during `next build`.

## Schema

The starter uses `prisma db push`. For a real deployment, generate a migration
baseline first (`prisma migrate dev`) and use `prisma migrate deploy` in your
release pipeline.

Session checks need the table `RevokedSession` and the column
`User.sessionVersion`. Both are additive: an existing database gets them with
`pnpm prisma:push` (measured on the test database: applied without a
data-loss prompt). Push the schema **before** starting the new code: without
the table every session check fails, and a failed check means "not signed in".
Sessions issued before the upgrade are refused, so every user signs in once.

## Before you go live

Work through the **Production Hardening Checklist in `SECURITY.md`** and read
its Known Limitations: the limits of session revocation, 2FA on Google
sign-in, in-memory rate limits, the encryption scheme, and the demo content
listed in the README.
