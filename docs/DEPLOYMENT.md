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
If the app connects as a restricted database user, grant it `SELECT`,
`INSERT` and `DELETE` on `"RevokedSession"` after the push: without `SELECT`
every session check fails, without `INSERT` a sign-out revokes nothing (not
measured: the test database is used with its owner).

The table `AccountLinkRequest` is no longer in the schema: the page that read
it was removed. Versions up to 2.3.0 wrote a row to it each time a user
entered the right password before linking Google, and nothing in the
application deleted those rows (read in the source of 2.3.0). A row went only
together with its account, when the account was deleted (`onDelete: Cascade`;
measured on the test database: deleting the user row deleted its link
request). Measured on the test database on 2026-10-03, with Prisma 6.19.3 and
no terminal attached:

- With the table **empty**, `pnpm prisma:push` drops it without a warning and
  without a question (exit code 0).
- With **one row** in it, `pnpm prisma:push` prints "You are about to drop
  the `AccountLinkRequest` table, which is not empty (1 rows)." and stops
  with "Use the --accept-data-loss flag to ignore the data loss warnings"
  (exit code 1). Nothing is changed: the table and the row are still there.
  `pnpm prisma:push --accept-data-loss` then drops the table (exit code 0);
  the user rows stay. The flag accepts every data-loss warning of that push,
  so check first that this table is the only one named.

In a terminal Prisma asks "Do you want to ignore the warning(s)?" instead of
stopping (read in the source of the Prisma CLI, not measured). The rows hold
nothing the application still reads: a token that was valid for 15 minutes,
the provider, and the raw `X-Forwarded-For` header of the request. Code up
to 2.3.0 still writes to the table, so its link initiation fails once the
table is gone and until the new code runs (read in the source, not measured).

The table `PasswordResetToken` and four columns of `User` are no longer in
the schema either: `emailVerificationRequired`, `twoFactorEnabledAt`,
`requiresPasswordChange` and `lastLoginIp`. Since 2.3.0 nothing in the
application has read any of them. No version from 2.0.0 to 2.4.0 wrote a row
to the table or a value to `lastLoginIp`; `requiresPasswordChange` was only
ever written as `false`, `emailVerificationRequired` became `false` when a
user followed the verification link, and `twoFactorEnabledAt` held the date
on which 2FA was enabled (read in the source of each tag). Measured on a test
database on 2026-10-05, with Prisma 6.19.3 and no terminal attached:

- With **no user row**, `pnpm prisma:push` drops the table and the four
  columns without a warning and without a question (exit code 0).
- With **one user row** that holds the column defaults, `pnpm prisma:push`
  prints "You are about to drop the column `emailVerificationRequired` on the
  `User` table, which still contains 1 non-null values.", the same line for
  `requiresPasswordChange`, and stops with "Use the --accept-data-loss flag
  to ignore the data loss warnings" (exit code 1). Nothing is changed. Both
  columns are `NOT NULL`, and both lines were printed in every measured state
  that had a user. A row whose `twoFactorEnabledAt` is set adds the same line
  for that column. A row in `PasswordResetToken`, which only code of your own
  can have written, adds "You are about to drop the `PasswordResetToken`
  table, which is not empty (1 rows)."
- `pnpm prisma:push --accept-data-loss` then completes the push (exit code
  0). The user row kept every other column, and its `Account` and
  `SecurityEvent` rows stayed as they were (compared before and after). The
  flag accepts every data-loss warning of that push, so check first that the
  warnings name nothing but this table and these columns.

Start the new code **before** this push: the opposite of the order that
`RevokedSession` needs. Measured with the Prisma client of 2.4.0 against the
pushed schema: a query that names its columns still works, but reading a
whole user row fails ("The column `User.lastLoginIp` does not exist in the
current database", P2022), and so does creating a user. Sign-in reads the
whole row (read in the source), so the old code signs nobody in once the
columns are gone. The new code does not need them: its integration suite
passes against a database that still has the old schema (the E2E suite was
not run that way). Coming from 2.0.0 or 2.1.0, which have no `RevokedSession`
table, the two orders contradict each other; stop the application for the
push (not measured).

Two of the dropped values were more than a default, and both have a
counterpart that stays (read in the source): the write that cleared
`emailVerificationRequired` also set `User.emailVerified`, and the action
that set `twoFactorEnabledAt` also wrote the `2fa_enabled` row in
`SecurityEvent`.

## Before you go live

Work through the **Production Hardening Checklist in `SECURITY.md`** and read
its Known Limitations: the limits of session revocation, 2FA on Google
sign-in, in-memory rate limits, the encryption scheme, and the demo content
listed in the README.
