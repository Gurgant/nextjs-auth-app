# Deployment

This is a starter, not a hosted product — there is no one-click deploy button
and no claims about platforms it "runs on". What follows is the honest minimum
you need to take it to production.

## Build & run

```bash
pnpm build          # next build (standalone Next.js app)
pnpm start          # serve the production build
```

Anything that runs Node 20+ and can reach PostgreSQL works: a VPS with a
process manager, a container platform, or Vercel (the app is a standard
Next.js App Router project; provision PostgreSQL separately, e.g. Neon or
Supabase).

## Environment

Set every variable from `.env.example` with production values. The server
validates configuration at boot (`src/lib/env.ts`) and **refuses to start** if
something critical is missing — in production that includes:

- `DATABASE_URL` — PostgreSQL with TLS (`sslmode=require`) recommended
- `AUTH_SECRET` (≥ 32 chars) — `openssl rand -base64 32`
- `ENCRYPTION_KEY` (exactly 64 hex chars) — `openssl rand -hex 32`
- `NEXTAUTH_URL` — your **https://** origin
- `RESEND_API_KEY` + `EMAIL_FROM` — without them e-mail sending is simulated
  (fine in dev, not in production)

## Schema

The starter uses `prisma db push` for simplicity. For a real deployment,
generate a migration baseline first (`prisma migrate dev`) and use
`prisma migrate deploy` in your release pipeline.

## Before you go live

Work through the **Production Hardening Checklist in `SECURITY.md`** — it
covers HTTPS, the rate-limiter's in-memory scope (use a shared store when
scaling horizontally), CSP tightening, trusted `X-Forwarded-For`, and secret
rotation. The known limitations listed there are real; read them.
