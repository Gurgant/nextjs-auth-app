# Architecture

A tour of how the pieces fit together, with file paths so you can check each
statement against the code.

## Big picture

```
Browser ──► src/middleware.ts        locale routing only (next-intl)
        ──► src/app/[locale]/…       pages; protected ones call auth() and redirect
        ──► src/app/api/…            route handlers: Auth.js, link/unlink Google,
                 │                   account info, admin metrics, health, web-vitals
                 ▼
        src/lib/actions/…            server actions
                 │
     ┌───────────┼──────────────┬──────────────────┐
     ▼           ▼              ▼                  ▼
 commands/   repositories/   events/          prisma (direct)
 (write ops) (user: creds,   (in-memory audit  (most other reads/writes:
             lockout)        / notifications)  2FA, linking, admin page)
                 │
                 ▼
          Prisma 6 → PostgreSQL 16
```

## Authentication (`src/lib/auth-config.ts`)

- **Auth.js v5 (NextAuth beta)** with the Prisma adapter and **JWT sessions**
  (`strategy: "jwt"`, idle timeout `SESSION_MAX_AGE`, default 7 days). Role and
  2FA flag are copied into the token at sign-in and not refreshed afterwards —
  see "Known Limitations" in `SECURITY.md`.
- **Credentials provider** — `authorize()` is the single choke point for
  e-mail + password sign-in:
  1. Zod-validates the input.
  2. Checks the in-memory limiter keyed by e-mail and client IP.
  3. `UserRepository.verifyCredentials()` → `valid` | `invalid` | `locked`
     (one bcrypt comparison on every path; an active database lock refuses
     even the right password).
  4. **Enforces TOTP 2FA when enabled**: without a valid code it throws the
     custom `2fa_required` / `2fa_invalid` `CredentialsSignin` errors, which
     the client form (`src/components/auth/credentials-form.tsx`) turns into a
     second, code-entry stage. Backup codes are verified and consumed here
     (the form itself only submits TOTP codes).
  5. Failed passwords and codes feed the database lockout
     (`registerFailedLogin`, policy in `src/lib/auth/lockout.ts`); a success
     resets it.
- **Google provider** — registered only when `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` are both set. The UI asks `/api/auth/providers`
  (`src/hooks/use-google-sign-in.ts`) and hides Google when it is absent.
  Google sign-ins go through the `signIn`/`jwt` callbacks, not `authorize()`,
  so they are not asked for a TOTP code. A Google sign-in marks the e-mail
  verified only when Google's ID token has `email_verified: true` for the
  address stored on the user. That is decided in one place,
  `src/lib/auth/google-email-verification.ts`, called from the `jwt` callback;
  an existing verification date is kept.
- 2FA secrets and backup codes are stored **encrypted** (`src/lib/security.ts`,
  passphrase `ENCRYPTION_KEY`, rule in `src/lib/env-rules.ts`).

## Authorization

- Roles: `USER`, `PRO_USER`, `ADMIN` (Prisma enum, single source of truth).
- Pure role helpers live in `src/lib/auth/roles.ts` and are safe for Client
  Components. Server guards live in `src/lib/auth/rbac.ts`: `withRole()` wraps
  role-restricted API routes (`/api/admin/metrics`).
- Pages enforce access themselves: `auth()` + `hasRole()` + `redirect()` in
  `dashboard/*` and `admin/page.tsx`, and the `AuthGuard` server component on
  `/account`. The middleware does not check authentication.

## Server actions (`src/lib/actions/`)

`auth.ts` (register, profile, password operations, account deletion) and
`advanced-auth.ts` (e-mail verification, link confirmation, 2FA lifecycle).
Starting and undoing a Google link are API routes
(`src/app/api/auth/link-account/{initiate,unlink}`) with their own password
re-check, 429 throttling and security events.

- Account actions take the user's identity from `auth()`, never from a
  client-sent id. Exceptions: the "send verification e-mail" action is keyed
  by the address it receives, and `verifyEmailToken` / `confirmAccountLinking`
  act on the owner of the token in the link, without a session.
- Registration, password change / add, account deletion and 2FA enabling
  validate input with Zod (in the action or in its command);
  `updateUserProfile` checks the name by hand, and the token / e-mail actions
  take their argument as is.
- Rate limits come from `src/lib/rate-limit.ts`.
- Security events are persisted by the actions, the link / unlink routes and
  `authorize()` (2FA enable/disable, e-mail verification, link initiation and
  unlinking, wrong link passwords, lockouts); sign-in and password events are
  not persisted yet — see `SECURITY.md`.

## Supporting layers (`src/lib/`)

| Layer        | Path                          | Role                                                                                                                                                |
| ------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repositories | `repositories/`               | User repository behind an interface (credentials check, lockout); much other code calls Prisma directly                                             |
| Commands     | `commands/`                   | Write operations as command objects + a command bus                                                                                                 |
| Events       | `events/`                     | Domain events; audit and notification handlers are in-memory                                                                                        |
| Errors       | `errors/`                     | Typed error taxonomy, used by the two commands (register user, change password)                                                                     |
| Validation   | `validation/`                 | Shared Zod schemas                                                                                                                                  |
| Monitoring   | `monitoring/`, `performance/` | Logger; an in-process performance monitor read by `/api/admin/metrics` (nothing records into it yet); web-vitals helpers and the bounded demo store |

## Internationalization

**next-intl** with five locales (`en`, `es`, `fr`, `it`, `de`) in `messages/`
at the repository root. All locales carry the same keys — enforced by
`pnpm validate-translations` in the pre-commit hook and by an E2E test. Every
page lives under `src/app/[locale]/`. The dashboards, the admin page and the
2FA prompt still contain English-only strings.

## Security posture

Headers (CSP, HSTS, frame denial, …) are set centrally in `next.config.ts`; the
environment is validated when the server starts (`src/lib/env.ts`). Limitations
and the production checklist live in **`SECURITY.md`**.

## Testing

Unit, integration (real PostgreSQL) and E2E layers — see **`docs/TESTING.md`**.
