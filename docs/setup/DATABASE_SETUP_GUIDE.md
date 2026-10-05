# Database Setup

The project uses **PostgreSQL 16** with two separate instances so automated
tests never touch development data:

| Instance    | Host port (default) | Used by                                |
| ----------- | ------------------- | -------------------------------------- |
| Development | `5432`              | `pnpm dev`, your `.env` `DATABASE_URL` |
| Test        | `5433`              | Jest integration tests, Playwright E2E |

Both are defined in `docker-compose.yml` and started together.

## Quick start

```bash
pnpm docker:up      # start both databases (docker compose up -d)
pnpm db:setup       # prisma generate + push the schema to DATABASE_URL
pnpm db:seed        # create the demo users (test/pro/admin @example.com)
```

To push the schema to the test database as well (needed before running the
integration or E2E suites):

```bash
pnpm db:push:test
```

## If ports 5432/5433 are taken

Set the overrides **before** `pnpm docker:up` (or put them in `.env`, which
docker compose reads automatically), and point `DATABASE_URL` at the port you
chose:

```bash
POSTGRES_DEV_PORT=55432
POSTGRES_TEST_PORT=15433
DATABASE_URL="postgresql://postgres:postgres123@127.0.0.1:55432/nextjs_auth_db"
```

The test scripts `db:push:test`, `db:reset:test` and `test:integration` set
`DATABASE_URL` to port **5433** themselves (via `cross-env`), so a shell prefix
is ignored. If you move the test database, run the underlying commands with
your URL instead, e.g. `DATABASE_URL=... pnpm prisma:push` (schema) or
`DATABASE_URL=... pnpm test` (Jest). Keep `5433` inside that URL (as in
`15433`): the Jest integration client only honours a `DATABASE_URL` that
contains it, and prints a notice when it sets another one aside
(`src/lib/prisma-test.ts`). For E2E, pass it the same way:
`DATABASE_URL=... pnpm test:e2e`.

> **Why `127.0.0.1` and not `localhost`?** On some systems (notably Windows)
> `localhost` resolves to IPv6 `::1` first, where the Docker port forward may
> not be listening — Prisma then fails with `P1001` even though the port is
> open. `127.0.0.1` avoids the problem everywhere.

## Housekeeping

```bash
pnpm docker:logs     # follow database logs
pnpm docker:down     # stop both databases (data volumes survive)
pnpm db:reset:test   # force-reset the TEST database schema
pnpm prisma:studio   # browse data with Prisma Studio
```

The schema is owned by Prisma (`prisma/schema.prisma`); this starter uses
`prisma db push` rather than migration files. If you adopt it for a real
product, switch to `prisma migrate` once your schema stabilizes.

Credentials (`postgres` / `postgres123`) are for **local development only** —
see `SECURITY.md` before deploying anything.
