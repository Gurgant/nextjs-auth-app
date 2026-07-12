# Architecture

A tour of how the pieces fit together. Everything described here exists in the
code — file paths are given so you can verify.

## Big picture

```
Browser ──► src/middleware.ts (locale routing + route protection)
        ──► src/app/[locale]/…       server components / pages
        ──► src/app/api/…            route handlers (NextAuth, health, account)
                 │
                 ▼
        src/lib/actions/…            server actions (Zod-validated inputs)
                 │
     ┌───────────┼──────────────┐
     ▼           ▼              ▼
 commands/   repositories/   events/
 (write ops) (data access)   (audit/notify)
                 │
                 ▼
          Prisma 6 → PostgreSQL 16
```

## Authentication (`src/lib/auth-config.ts`)

- **Auth.js v5 (NextAuth beta)** with the Prisma adapter and **JWT sessions**
  (`strategy: "jwt"`); role and 2FA status ride in the token.
- **Credentials provider** — `authorize()` is the single choke point:
  1. Zod-validates input, applies a per-email rate limit.
  2. Verifies the password (bcrypt, cost 12) via the user repository.
  3. **Enforces TOTP 2FA when enabled**: without a valid code the login
     _throws_ `2fa_required` / `2fa_invalid` custom `CredentialsSignin`
     errors, which the client form (`src/components/auth/credentials-form.tsx`)
     turns into a second, code-entry stage. Backup codes are consumed on use.
- **Google provider** (optional — enabled only when both env vars are set).
- 2FA secrets and backup codes are stored **encrypted** (`src/lib/security.ts`,
  key from `ENCRYPTION_KEY`).

## Authorization

- Roles: `USER`, `PRO_USER`, `ADMIN` (Prisma enum, single source of truth).
- `withRole()` / `requireRole()` in `src/lib/auth/rbac.ts` guard API routes
  and server code; `role-guard.tsx` gates client UI.
- `src/middleware.ts` protects route groups (`/dashboard`, `/admin`, …) and
  handles locale negotiation for next-intl.

## Server actions (`src/lib/actions/`)

`auth.ts` (register, password ops, account deletion) and `advanced-auth.ts`
(email verification, account linking, 2FA lifecycle). Conventions:

- Input validated with **Zod** at the boundary.
- Identity always derived from `auth()` — never from client-sent ids.
- Rate limits from `src/lib/rate-limit.ts` on sensitive flows.
- Every security-relevant event is recorded (`SecurityEvent` table) via
  `src/lib/security.ts`.

## Supporting layers (`src/lib/`)

| Layer        | Path            | Role                                          |
| ------------ | --------------- | --------------------------------------------- |
| Repositories | `repositories/` | Prisma access behind interfaces (user, base)  |
| Commands     | `commands/`     | Write operations as command objects + bus     |
| Events       | `events/`       | Domain events (audit log, notifications)      |
| Errors       | `errors/`       | Typed error taxonomy used by actions/handlers |
| Validation   | `validation/`   | Shared Zod schemas                            |
| Monitoring   | `monitoring/`   | Logger + web-vitals reporting (dev-gated)     |

## Internationalization

**next-intl** with five locales (`en`, `es`, `fr`, `it`, `de`) under
`messages/`. All locales carry the same keys — enforced by
`pnpm validate-translations`, which runs in the pre-commit hook. Every page
lives under `src/app/[locale]/`.

## Security posture

Headers (CSP, HSTS, frame denial, …) are set centrally in `next.config.ts`;
environment configuration is validated at boot by `src/lib/env.ts` (the server
refuses to start on invalid config). The full threat-model discussion,
known limitations, and the production checklist live in **`SECURITY.md`**.

## Testing

Three layers (unit / integration / E2E) — see **`docs/TESTING.md`**.
