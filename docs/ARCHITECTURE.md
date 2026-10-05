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
re-check, 429 throttling and security events. Both read the request in one
place (`src/lib/auth/link-account-request.ts`): the body has to be a JSON
object with a password and a provider, both strings, and Google is the only
provider either route accepts; anything else is answered 400 before the
database is asked and is not counted as a wrong password. Every refusal
carries a `code` next to its English `error`
(`src/lib/auth/link-account-errors.ts`): the account page shows the text of
the code in the visitor's language, and never the English one.

`initiate` links nothing and returns no token: it checks the password, writes
a **link grant** on the user's row (`User.linkGrantProvider` and
`User.linkGrantExpiresAt`: the provider, and an end 5 minutes later) and the
`account_link_initiated` event in one transaction (a grant never stays
without its event), and answers `{ success, provider }`. The account page
then starts the Google sign-in. When Google returns, Auth.js links through
the adapter it was given, and that adapter is the Prisma adapter with the
link gate in front of it (`withLinkGate` in `src/lib/auth-config.ts`). Three
files:

- `src/lib/auth/link-grant.ts` writes the grant and spends it; the spend is
  one conditional `UPDATE`, so a grant is used once however many callbacks
  arrive together.
- `src/lib/auth/link-gate.ts` is the rule, in the adapter's `linkAccount`.
  The row Auth.js has just created for a first sign-in (no password, e-mail
  not verified, no `Account` row) is linked as before. Any other user is
  linked only after the grant was spent, and only when the row that was read
  before the spend shows no account of that provider. Otherwise the gate
  records `account_link_refused` and throws, which stops Auth.js before it
  issues a session token (read in the source of `@auth/core` 0.41.3). It
  decides from the database alone: no request, no cookie. The read, the
  spend and the link are three statements, not one transaction: two password
  steps whose links overlap can both link (`SECURITY.md`, "Not one
  transaction").
- `src/lib/auth/link-refusal.ts` only chooses the page a refusal ends on.
  The route handlers of Auth.js (`src/app/api/auth/[...nextauth]/route.ts`)
  are wrapped, and the redirect of a request in which the gate refused goes
  to `/auth/error?error=LinkNotConfirmed`: without a locale, so the
  middleware adds the visitor's.

That Auth.js writes `Account` rows through `linkAccount` and nothing else was
read in the source of `@auth/core` 0.41.3. The integration test runs
Auth.js's decision function with the application's adapter on real
PostgreSQL; no test completes a Google sign-in, so the exchange with Google
before that function and the redirect after a refusal are read, not measured
— see "Security Features" and "Known Limitations" in `SECURITY.md`, and
`docs/TESTING.md`.

- Account actions take the user's identity from `auth()`, never from a
  client-sent id. Exceptions: the "send verification e-mail" action is keyed
  by the address it receives, and `verifyEmailToken` acts on the owner of the
  token in the link, without a session.
- Registration, password change / add, account deletion and 2FA enabling
  validate input with Zod (in the action or in its command);
  `updateUserProfile` checks the name by hand, and the token / e-mail actions
  take the token or the address as is.
- Every action answers in one of the five supported locales, and in the
  default one for any other value. The actions that take a form use the field
  `_locale`, which `useLocalizedAction` appends, unless it is missing,
  unsupported or the default `en`: then the `NEXT_LOCALE` cookie decides
  (`resolveFormLocale` cannot tell a field that says `en` from one that was
  not sent). So the form of an English page is answered in the language of the
  cookie when the cookie names another one. The unit tests of `registerUser`
  show it (`auth.register.test.ts` in `src/lib/actions/__tests__/`); whether a
  browser of this app can hold such a cookie on an English page was not
  measured. The other actions take the locale as an argument; for the "send
  verification e-mail" action it also goes into the e-mailed link.
- `verifyEmailToken` runs while the verification page renders, so the same
  link is requested again by a reload, by a change of language, and by the
  visitor after something else opened it. It verifies an address once. Its two
  writes are conditional (the token only while it is unused, the address only
  while it is not verified), and only the request that verifies writes the
  user row and records the `email_verified` event. By state of the token: a
  used token of a verified address answers that the address is already
  verified, also after its 30 minutes; an unused token that has not expired,
  of an address that is already verified, answers the same and is used up,
  and nothing else is written; an unused token that has expired keeps its
  failure, also when the address is verified; a used token of an address that
  is not verified and an unknown token keep their failures. Each state has a
  unit test in `src/lib/actions/__tests__/` (`advanced-auth.test.ts`,
  `verify-email-once.test.ts`). Requests that arrive together were measured
  against PostgreSQL, outside the suite: one link requested twice (25 rounds)
  and five times (10 rounds), and two links of one user (25 rounds). In every
  round one request verified, the others answered "already verified", and one
  event was recorded.
- Rate limits come from `src/lib/rate-limit.ts`. Registration and the "send
  verification e-mail" action count an attempt before anything validates the
  address, so the key they build from it is the address in lower case, cut
  to 254 characters (`src/lib/actions/rate-limit-key.ts`).
- Security events are persisted by the actions, the link / unlink routes,
  the link gate and `authorize()` (2FA enable/disable, e-mail verification,
  link initiation, completed and refused links, unlinking, wrong link
  passwords, lockouts); sign-in and password events are not persisted yet —
  see `SECURITY.md`.

## Supporting layers (`src/lib/`)

| Layer        | Path            | Role                                                                                                    |
| ------------ | --------------- | ------------------------------------------------------------------------------------------------------- |
| Repositories | `repositories/` | User repository behind an interface (credentials check, lockout); much other code calls Prisma directly |
| Commands     | `commands/`     | Write operations as command objects + a command bus                                                     |
| Events       | `events/`       | Domain events on an in-process bus, with two example listeners kept in memory (below)                   |
| Errors       | `errors/`       | Six typed errors, created by the two commands (register user, change password) and by nothing else      |
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
error (a command that threw) or critical in every environment, the others in
development only. No typed error is critical: the errors layer gives the
severity `high` to an exception that a command did not expect and `low` to
its other errors (`src/lib/errors/__tests__/error-layer.test.ts`). These
entries are not the `SecurityEvent` records above, which are written to the
database without the bus. The bus does not wait for its listeners: a request
that publishes an event goes on without them, and a listener that fails gets
up to three attempts, one second apart. The bus also has members that
nothing calls (`subscribe` with a callback, `publishMany`, `unsubscribe`,
`unsubscribeAll`, `getSubscriptionsByType`): they are kept on purpose, as the
ordinary equipment of an example bus.

The errors layer is what those two commands use: `ErrorFactory`
(`validation.fromZod`, `validation.invalidInput`, `business.notFound`,
`business.operationNotAllowed`, `business.alreadyExists`, `wrap`) and the
builder behind `createError()`, which adds a user id and a correlation id.
An error carries a code, a category, a severity and an HTTP status; `log()`
prints it on the server. What the command answers is a text of the `Errors`
or `Success` namespace in the locale of its input, with a generic one for an
exception it did not expect; the error's own English message is the answer
only when the command gets no locale, or when the messages of that locale
cannot be read. A form that fails the command's schema is answered with one
message: the texts of the schema stay in the server log. The HTTP status is
not used yet: no route handler creates one of these errors.

The command bus keeps a list of its own, outside the events layer
(`AuditMiddleware`, `src/lib/commands/middleware/audit.middleware.ts`): its
newest 1,000 entries, in the memory of one process and read only by tests. An
entry holds the command name, the command id and the user id, the time, the
duration, the outcome and, for a command that threw, the class name of the
error (for a value that is not an Error, its description in the failed event).
It holds no input, no output, no error text and nothing of the request
(`src/lib/commands/__tests__/no-retained-secrets.test.ts`).

## Internationalization

**next-intl** with five locales (`en`, `es`, `fr`, `it`, `de`) in `messages/`
at the repository root. All locales carry the same keys — enforced by
`pnpm validate-translations` in the pre-commit hook and by an E2E test. A
unit test (`src/test/unit/__tests__/message-keys.test.ts`) fails when a key
of `messages/en.json` is read by no application file under `src/` (tests do
not count), or when a message file writes a key twice in one object; its
header lists the forms of a read that it knows. Every page lives under
`src/app/[locale]/`. The dashboards, the admin page and the 2FA prompt still
contain English-only strings.

What the server actions and the two commands answer comes from the `Errors`
and `Success` namespaces, and the field errors of the forms that an action
validates itself from `validation`, all in the locale of the request (see
"Server actions"). `/api/account/info` does not know the language of the page
that asks: it names each failure with a `code`, and the account page says it
in its own language (`src/hooks/use-account-data.ts`). The link / unlink
routes still answer English texts.

The language selector of the navigation bar
(`src/components/language-selector.tsx`) leads to the page the visitor is on,
under the chosen locale: it replaces the locale segment of the current path
(`switchLocale()` in `src/lib/utils/navigation.ts`) and keeps the query string
and the fragment. It asks no list of routes: whatever the path is, a URL
parser resolves the result on the same origin and under the chosen locale. A
path whose dot segments (`..`) would lead out of the locale gives the home
page of that locale instead. That case is unit-tested; in Chromium the three
addresses with dot segments that were tried were resolved before the page
was requested, so no such path reached the selector.
`e2e/tests/language-selector.e2e.ts` checks the selector in a browser, page by
page. The page is requested again under the new locale, and the e-mail
verification page uses its token up on the first request: after the change of
language, and after a reload, the visitor reads that the address is already
verified (see "Server actions"). The same spec opens the page with a real
token, changes the language and reloads.

## Security posture

Headers (CSP, HSTS, frame denial, …) are set centrally in `next.config.ts`; the
environment is validated when the server starts (`src/lib/env.ts`). Limitations
and the production checklist live in **`SECURITY.md`**.

## Testing

Unit, integration (real PostgreSQL) and E2E layers — see **`docs/TESTING.md`**.
