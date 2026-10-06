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

A database that an earlier version has used is upgraded as described below,
the newest release first.

### From 2.5.0 to 2.5.1

The schema does not change (`prisma/schema.prisma` is the same file in both
versions), so there is nothing to push. Run `pnpm install` before the build:
the lockfile names a newer version of one indirect dependency
(`source-map-js` 1.2.2).

From 2.5.1 an `Account` row says whose account it is and holds none of the
provider's tokens (`SECURITY.md`, "For a Google account the application
stores which user it belongs to"). Rows that an earlier version wrote keep
what it stored for a Google account: the values of Google's token response,
in plain text.
Nothing in the application reads them. One statement clears them:

```sql
UPDATE "Account"
SET "access_token" = NULL,
    "refresh_token" = NULL,
    "id_token" = NULL,
    "expires_at" = NULL,
    "token_type" = NULL,
    "scope" = NULL,
    "session_state" = NULL
WHERE num_nonnulls("access_token", "refresh_token", "id_token", "expires_at",
                   "token_type", "scope", "session_state") > 0;
```

It empties the seven columns in every row that holds a value in one of them,
whatever the provider, and changes nothing else, so every account stays
linked. **Measured** on 2026-10-06 on the test database (PostgreSQL 16.10,
with `psql`), with four `Account` rows of two users: a Google row with an
access token, a refresh token, an ID token and their expiry, type and scope;
the credentials row of the same user; a Google row without a refresh token;
and a row of another provider with a value in `expires_at` and
`session_state` only. The statement answered `UPDATE 3`. Afterwards the
seven columns were `NULL` in all four rows, and the other five columns of
each row and the two user rows were as before (compared as text, before and
after; the same comparison over every column reported the three rows that
had changed). A second run answered `UPDATE 0`.

**Not measured.** The four rows were written with `INSERT`, not by the
application: that 2.5.0 stores these values was measured with its code (the
integration test, before the change). No Google sign-in was made after the
statement; a returning Google user whose row holds no token signs in with
Auth.js's decision function (the integration test). The statement reaches
this database only: a backup made before it still holds the values, and
nothing is revoked at Google.

If instances of both versions run during the upgrade, run the statement when
no instance of 2.5.0 is left: 2.5.0 stores the tokens of every account that
is linked through it.

### From 2.4.0 to 2.5.0

The schema of 2.5.0 changes in both directions, and one `pnpm prisma:push`
applies all of it in one step:

- **Added:** two columns of `User`, `linkGrantProvider` and
  `linkGrantExpiresAt`, both nullable. They hold the link grant (see "Linking
  Google needs the password" in `SECURITY.md`).
- **Dropped:** the table `PasswordResetToken` and four columns of `User`:
  `emailVerificationRequired`, `twoFactorEnabledAt`, `requiresPasswordChange`
  and `lastLoginIp`. Nothing in the application read them any more (see
  "What is dropped" below).

**Neither code runs on the other one's schema.** Measured with the Prisma
client generated from each schema, against a database in each of three
states, with a read of a whole user row and the creation of a user:

| Database                             | Client of 2.4.0 | Client of 2.5.0 |
| ------------------------------------ | --------------- | --------------- |
| schema of 2.4.0                      | both work       | both fail       |
| schema of 2.4.0 plus the two columns | both work       | both work       |
| schema of 2.5.0                      | both fail       | both work       |

The failures are Prisma's P2022: for the client of 2.5.0 "The column
`User.linkGrantProvider` does not exist in the current database", for the
client of 2.4.0 the same sentence about `User.lastLoginIp` (the read) and
about `requiresPasswordChange` (the creation). A query that names its columns
worked in all six cases. Sign-in reads the whole row, with a password
(`UserRepository.findByEmail`) and with Google (the Prisma adapter), and the
session check names its columns (read in the source of both versions and of
`@auth/prisma-adapter` 2.11.3). So with "push" and "start the new code" alone
there is a time in which nobody can sign in or register, whichever comes
first; the session check of someone who is signed in still passes. There are
two ways to upgrade, and both were measured.

**A. Without stopping the application**

1. While the code of 2.4.0 runs, add the two columns by hand:

   ```sql
   ALTER TABLE "User"
     ADD COLUMN "linkGrantProvider" TEXT,
     ADD COLUMN "linkGrantExpiresAt" TIMESTAMP(3);
   ```

2. Build and start the code of 2.5.0 (`pnpm install`, `pnpm prisma:generate`,
   `pnpm build`, `pnpm start`). The database is now in the state of the
   middle row of the table, the one in which both clients work.
3. When no instance of 2.4.0 runs any more, push the schema. It has only
   things to drop now: run `pnpm prisma:push` and read what it lists.
   Without a terminal it stops there, and
   `pnpm prisma:push --accept-data-loss` then applies it. In a terminal it
   asks instead, and a yes applies it at once (see "What the push prints").

**B. With the application stopped**

1. Stop the code of 2.4.0.
2. In the tree of 2.5.0, after `pnpm install`, run `pnpm prisma:push`, read
   what it lists and confirm as in step 3 of way A. The push applies the
   `prisma/schema.prisma` of the tree it is run in: started in the tree of
   2.4.0 it would compare the database with the schema of 2.4.0 (that case
   was not measured).
3. Build and start the code of 2.5.0 (`pnpm prisma:generate`, `pnpm build`,
   `pnpm start`).

**What the push prints.** On a database with a user row, `pnpm prisma:push`
without the flag and with no terminal attached stops with exit code 1 and
changes nothing: the two columns are not added either. It prints "There
might be data loss when applying the changes:", one line for each column or
table that holds something, and "Error: Use the --accept-data-loss flag to
ignore the data loss warnings like prisma db push --accept-data-loss". With
two users, one of whom had enabled 2FA, the lines were:

```
  • You are about to drop the column `emailVerificationRequired` on the `User` table, which still contains 2 non-null values.
  • You are about to drop the column `requiresPasswordChange` on the `User` table, which still contains 2 non-null values.
  • You are about to drop the column `twoFactorEnabledAt` on the `User` table, which still contains 1 non-null values.
```

The first two columns are `NOT NULL`, so every database with a user gets
these two lines, with the number of its users. The third is there when a
user row holds a value in `twoFactorEnabledAt`: a user who enabled 2FA in
the application and has not disabled it since. Versions 2.0.0 to 2.4.0 set
the column back to `NULL` when 2FA was disabled (read in the source of each
tag). A row in `PasswordResetToken`, which only code of your own can have
written, adds "You are about to drop the `PasswordResetToken` table, which
is not empty (1 rows)." Nothing else is named: not the two columns that are
added, not `lastLoginIp` (no version wrote it), not the table while it is
empty. `pnpm prisma:push --accept-data-loss` prints the same lines, then
"Your database is now in sync with your Prisma schema.", generates the
Prisma client again into `src/generated/prisma` (its line reads "Generated
Prisma Client (v6.19.3)") and ends with exit code 0. A push that stops
generates nothing. The flag accepts every data-loss warning of that push, so
check first that the lines name nothing but these three columns and this
table. On a database without any row the push needs no flag: it completes
without a warning (exit code 0).

In a terminal, outside CI, Prisma asks "Do you want to ignore the
warning(s)?" after the same lines instead of stopping: a yes applies the
push at once, without the flag, and a no prints "Push cancelled." and ends
with exit code 130 (read in the source of the Prisma CLI 6.19.3, not
measured). Prisma takes it for a terminal when its input is one, `TERM` is
not `dumb` and none of the CI variables it knows is set (`CI`,
`GITHUB_ACTIONS` and others).

**Measured** on 2026-10-05 on a scratch database, PostgreSQL 16.10, with
Prisma 6.19.3 and no terminal attached, each way as one sequence from the
same state: the schema of the tag `v2.4.0`, with two users (one with a
password who had enabled 2FA, so with `twoFactorEnabledAt` set; one who
signs in with Google), two `Account` rows (one of Google, with its tokens),
two `SecurityEvent` rows, one `EmailVerificationToken` row and one
`RevokedSession` row.

- **Way B.** The push without the flag: the output above, exit code 1;
  tables, columns, indexes, constraints and rows as before. With the flag:
  exit code 0. Then the table and the four columns were gone, the two new
  columns were there and `NULL` in both user rows, and every other column of
  every row of the five tables was as before (compared as text, before and
  after; the same comparison reported a value that was changed on purpose).
  The client of 2.5.0 read a whole user row and created a user; the client
  of 2.4.0 could do neither any more. A further `pnpm prisma:push` printed
  "The database is already in sync with the Prisma schema." (exit code 0).
- **Way A.** Before the statement the client of 2.5.0 failed and the client
  of 2.4.0 worked. The statement changed nothing but the two columns (rows
  compared). After it both clients read a whole user row and created a user.
  The push then printed the same three lines and stopped (exit code 1,
  nothing changed); with the flag it completed (exit code 0), and the
  database had the same structure as at the end of way B, with the same
  rows.
- **The code of 2.5.0 between step 1 and step 3 of way A.** Its integration
  file (51 tests: the user repository, registration, lockout, the session
  check and the link gate on real PostgreSQL) was run against the schema of
  2.4.0 plus the two columns: 51 passed. Against the schema of 2.4.0 without
  them, 46 of the 51 failed with the P2022 above.

**Not measured.** The application itself was not started during either way:
no sign-in through `next start`, and no run of the E2E suite on the database
of step 1. The two generated clients and the integration file stand for it.
The question that Prisma asks in a terminal, and what a yes and a no do,
were read in the source of the Prisma CLI (see above); no push was run in a
terminal. That the push writes the client again while the application runs
from the same tree, as in step 3 of way A, was not measured either; Prisma's
own line names `--skip-generate` (not run with it). If the app connects as a
restricted database user, the link grant needs `UPDATE` on `"User"`, which
sign-in needs already (the scratch database is used with its owner). Coming
from a version before 2.4.0, use way B: the statement of way A adds only
what 2.5.0 added to 2.4.0. One push then applies every schema change since
that version, so its lines can also name what the sections below drop
(`AccountLinkRequest`, and from 2.0.0 `primaryAuthMethod`); that combined
push was not measured.

**The way back.** A push of the schema of 2.4.0 onto the upgraded database
re-created the table and the four columns and dropped the two link columns,
without a warning (exit code 0), and the client of 2.4.0 read and created
users again (measured). What the four columns held does not come back: every
user row had `emailVerificationRequired` `true`, `requiresPasswordChange`
`false` and no `twoFactorEnabledAt`. While a row holds a link grant, that
push stops like the one above and names `linkGrantExpiresAt` and
`linkGrantProvider` (measured with one grant).

**A development or test database** has no running code to keep alive: push
as in way B. `pnpm db:push:test` is the same push with the URL of the docker
test database (read in `package.json`, not run), and a test database that
holds a user row needs the flag as well. Measured: after a run of the Jest
suite the test database held one user row.

**What is dropped.** Since 2.3.0 nothing in the application has read the
table or any of the four columns. No version from 2.0.0 to 2.4.0 wrote a row
to the table or a value to `lastLoginIp`; `requiresPasswordChange` was only
ever written as `false`, `emailVerificationRequired` became `false` when a
user followed the verification link, and `twoFactorEnabledAt` held the date
on which 2FA was enabled and was set back to `NULL` when it was disabled
(read in the source of each tag). Two of the dropped values were more than a
default, and both have a counterpart that stays (read in the source): the
write that cleared `emailVerificationRequired` also set
`User.emailVerified`, and the action that set `twoFactorEnabledAt` also
wrote the `2fa_enabled` row in `SecurityEvent`.

### From 2.3.0 to 2.4.0

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
stopping, and a yes applies the push at once (read in the source of the
Prisma CLI, not measured). The rows hold nothing the application still
reads: a token that was valid for 15 minutes, the provider, and the raw
`X-Forwarded-For` header of the request. Code up to 2.3.0 still writes to
the table, so its link initiation fails once the table is gone and until the
new code runs (read in the source, not measured).

### From 2.2.0 to 2.3.0

The schema does not change (read in the schema of the two tags).

### From 2.1.0 to 2.2.0

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

### From 2.0.0 to 2.1.0

The column `User.primaryAuthMethod` is dropped and `User.lastLoginMethod` is
added (read in the schema of the two tags). `CHANGELOG.md` says under
"Upgrading a database from v2.0.0" that `pnpm prisma:push` refuses when a
row still has a value in `primaryAuthMethod`, and what to run then; that
push was not measured again for 2.5.0 or 2.5.1.

## Before you go live

Work through the **Production Hardening Checklist in `SECURITY.md`** and read
its Known Limitations: the limits of session revocation, 2FA on Google
sign-in, in-memory rate limits, the encryption scheme, and the demo content
listed in the README, with the two placeholder pages (`/{locale}/terms`,
`/{locale}/privacy`) that need your own texts.
