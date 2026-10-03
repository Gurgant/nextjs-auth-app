# Architecture

A tour of how the pieces fit together, with file paths so you can check each
statement against the code.

## Big picture

```
Browser ──► src/middleware.ts        locale routing only (next-intl)
        ──► src/app/[locale]/…       pages; protected ones call auth() and redirect
        ──► src/app/api/…            route handlers: Auth.js, link/unlink Google,
                 │                   account info, admin metrics, health
                 ▼
        src/lib/actions/…            server actions
                 │
     ┌───────────┼──────────────┬──────────────────┐
     ▼           ▼              ▼                  ▼
 commands/   repositories/   events/          prisma (direct)
 (write ops) (user: creds,   (in-memory audit  (most other reads/writes:
             lockout)        / analytics)      2FA, linking, admin page)
                 │
                 ▼
          Prisma 6 → PostgreSQL 16
```

## Authentication (`src/lib/auth-config.ts`)

- **Auth.js v5 (NextAuth beta)** with the Prisma adapter and **JWT sessions**
  (`strategy: "jwt"`, idle timeout `SESSION_MAX_AGE`, default 7 days). Name,
  e-mail and 2FA flag are copied into the token at sign-in and not refreshed
  afterwards; the role is re-read at every session check — see "Known
  Limitations" in `SECURITY.md`.
- **Session checks** (`src/lib/auth/session-revocation.ts`). The `jwt`
  callback puts two more claims into the token at sign-in: `sid`, a random
  session id, and `sv`, the user's `sessionVersion` at that moment (for an
  e-mail + password sign-in, the one of the row the password was checked
  against, so a sign-in with the old password that overlaps a password change
  gets the version from before it and is refused at its first check). Neither
  is copied into the session object. `src/lib/auth.ts`
  passes Auth.js a `jwt.decode` that first decodes the cookie as usual and
  then asks the database, with two primary-key lookups. The session is live
  when its `sid` is not in `RevokedSession` (written by the `signOut` event)
  and the user still exists with the same `sessionVersion` (incremented by a
  password change); the role in the token is then replaced by the one in the
  database. Otherwise the token decodes to `null`, which Auth.js treats as an
  invalid token: no session. A failed lookup throws, with the same result
  (fail closed). The check sits in `decode` and not in the `jwt` callback
  because Auth.js also decodes the cookie without calling that callback (at
  sign-out, and when a Google sign-in returns to a browser that already has a
  session cookie; the Google case is read in the source of `@auth/core`
  0.41.3, not measured).
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
  Components. The server guard lives in `src/lib/auth/rbac.ts`: `withRole()`
  wraps role-restricted API routes (`/api/admin/metrics`).
- Pages enforce access themselves: `auth()` + `hasRole()` + `redirect()` in
  `dashboard/*` and `admin/page.tsx`, and the `AuthGuard` server component on
  `/account`. The middleware does not check authentication. With the session
  check above it could not call `auth()` as it is: Next.js middleware runs in
  the Edge runtime by default and the check uses Prisma (read in the Next.js
  documentation, not measured).

## Server actions (`src/lib/actions/`)

`auth.ts` (register, profile, password operations, account deletion) and
`advanced-auth.ts` (e-mail verification, 2FA lifecycle). The password check
before linking Google and the unlinking of Google are API routes
(`src/app/api/auth/link-account/{initiate,unlink}`) with their own password
re-check, 429 throttling and security events. `initiate` links nothing and
returns no token: it checks the password, records `account_link_initiated`
and answers `{ success, provider }`. The account page then starts the Google
sign-in, and Auth.js links the Google account to the signed-in user when
Google returns (read in the source of `@auth/core` 0.41.3, not measured: the
tests never complete a Google sign-in). The server does not require the
password check for that — see "Known Limitations" in `SECURITY.md`.

- Account actions take the user's identity from `auth()`, never from a
  client-sent id. Exceptions: the "send verification e-mail" action is keyed
  by the address it receives, and `verifyEmailToken` acts on the owner of the
  token in the link, without a session.
- Registration, password change / add, account deletion and 2FA enabling
  validate input with Zod (in the action or in its command);
  `updateUserProfile` checks the name by hand, and the token / e-mail actions
  take the token or the address as is. The "send verification e-mail" action
  checks its locale against the five supported ones, because the locale goes
  into the e-mailed link.
- Rate limits come from `src/lib/rate-limit.ts`.
- Security events are persisted by the actions, the link / unlink routes and
  `authorize()` (2FA enable/disable, e-mail verification, link initiation
  and unlinking, wrong link passwords, lockouts); sign-in and password events
  are not persisted yet — see `SECURITY.md`.

## Supporting layers (`src/lib/`)

| Layer        | Path            | Role                                                                                                    |
| ------------ | --------------- | ------------------------------------------------------------------------------------------------------- |
| Repositories | `repositories/` | User repository behind an interface (credentials check, lockout); much other code calls Prisma directly |
| Commands     | `commands/`     | Write operations as command objects + a command bus                                                     |
| Events       | `events/`       | Domain events on an in-process bus, with two example listeners kept in memory (below)                   |
| Errors       | `errors/`       | Typed error taxonomy, used by the two commands (register user, change password)                         |
| Validation   | `validation/`   | Shared Zod schemas                                                                                      |

The events layer carries five events: a registration and a password change
(published by the two commands), a command that returned or threw (by the
command bus) and the creation of a typed error (by its constructor). Two
example listeners receive every event: an audit log (ids, outcomes, error type
and code; no e-mail address, name, IP address, user agent or error message)
and analytics counters. Each keeps its newest 10,000 entries in the memory of
one process: they are lost at restart, not shared between instances, and read
only by tests (`src/lib/events/__tests__/event-provider.test.ts`). The audit
listener also prints its entries to the server console: those of severity
error or critical (a command that threw, a critical error) in every
environment, the others in development only. These entries are not the
`SecurityEvent` records above, which are written to the database without the
bus. The bus does not wait for its listeners: a request that publishes an
event goes on without them, and a listener that fails gets up to three
attempts, one second apart.

The command bus keeps a list of its own, outside the events layer
(`AuditMiddleware`, `src/lib/commands/middleware/audit.middleware.ts`): its
newest 1,000 entries, in the memory of one process and read only by tests. An
entry holds the command name, the command id and the user id, the time, the
duration, the outcome and, for a command that threw, the class name of the
error. It holds no input, no output, no error text and nothing of the request
(`src/lib/commands/__tests__/no-retained-secrets.test.ts`).

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
