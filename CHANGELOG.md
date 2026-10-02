# Changelog

## [v2.2.0] - 2026-10-02

### 🔒 Security

- **Sessions end on the server.** Every decode of the session cookie is
  checked against the database. Signing out ends that session (a copy of its
  cookie, or a session response that arrives late, is refused); a password
  change ends every session of the user, the one that made the change
  included; a deleted account ends its sessions; the role is re-read at every
  check. A failed lookup means no session. See `SECURITY.md`.
- A Google sign-in marks the e-mail verified only when Google's ID token has
  `email_verified: true` for the address stored on the user, for a new user
  at the first sign-in too. It was marked on every Google sign-in of an
  existing user, whatever Google reported, also on a refused sign-in. The
  order in which Auth.js calls the callbacks was read in the source of
  `@auth/core` 0.41.3, not measured against Google. See `SECURITY.md`.
- No plain-text password stays in memory after a command: the command
  history, undo and redo (which nothing called) are removed.
- `BCRYPT_ROUNDS` now applies to every path of the application that stores a
  password (adding a password to a Google account and
  `UserRepository.update()` used a fixed cost of 12). The seed,
  `pnpm create-user` and the E2E fixtures still hash at a fixed cost of 12.
- An unexpected failure in registration or password change answers a fixed
  generic message; the internal error's message is no longer sent to the
  client.
- The in-memory audit log of the command bus keeps the newest 1,000 entries;
  it grew without limit.

### 🔧 Changed

- After a password change the account page signs out and the message asks to
  sign in again.
- Deleting the account answers an error when the user row was not deleted; it
  answered "deleted" before.
- `IUserRepository.updatePassword` takes a third, required argument
  `{ revokeSessions: boolean }`: a call written for v2.1.0, with two
  arguments, no longer compiles. `UserRepository.update()` with a password
  ends the user's sessions too. The `PasswordChangedEvent` published after a
  password change carries `requiresLogout: true` (it was `false`).
- The callback parameter types in `src/types/next-auth.d.ts` resolved to
  `any`; the missing type imports are added, and a compile-time test fails
  `pnpm typecheck` when one of them is `any` again.

### 🗑️ Removed

- Dead code, 4,162 lines deleted (nothing imported or called them): two error
  components, seven test-support files, unused entries of the error factory
  with their classes, ten two-factor helpers and smaller leftovers, among
  them `useMultipleFormReset`, `createRequestLogger`, `measurePerformance`,
  `getRepositories` and `BaseEvent.fromJSON` (the full list is in the commit
  history). No runtime change.
- The command history with undo and redo: `commandBus.undo()`, `redo()`,
  `getHistory()` and `clearHistory()`, `CommandHistory`, the bus options
  `enableHistory` and `maxHistorySize`, `ICommand.canUndo` / `undo` / `redo`
  and `CommandUndoneEvent`. `BaseCommand.logExecution()` no longer takes the
  input and `logSuccess()` no longer takes the output: a command written for
  v2.1.0 that passes them no longer compiles.
- Five types of `src/types/next-auth.d.ts` that nothing used
  (`SignOutEventMessage`, `CreateUserEventMessage`, `LinkAccountEventMessage`,
  `SessionEventMessage`, `SignInCallbackParams`).

### ⬆️ Upgrading a database from v2.1.0

- Run `pnpm prisma:push` **before** starting the new code: new table
  `RevokedSession`, new column `User.sessionVersion`. Without the table every
  session check fails closed (nobody is signed in). For a restricted database
  user see `docs/DEPLOYMENT.md`.
- A clone that already has the test database needs the new schema there as
  well: `pnpm db:push:test`. The integration file and the E2E setup use the
  new table (read in the source, not measured).
- Every user signs in once: session tokens issued by an earlier version are
  refused. Auth.js logs a `JWTSessionError` at error level when a session
  check meets a refused token (see `SECURITY.md`).

### 🧪 Tests

- Jest: 721 tests (was 467). Playwright: 88 tests (was 82).
- The E2E suite requests every route it visits before the first test, so
  that `next dev` compiles them there, and fails the run when the dev server
  compiles while tests are running.
- The unit suite fails on dead code (a module nothing reaches, an export
  nothing mentions).
- Coverage no longer counts the generated Prisma client: 43 % of statements
  (the same run with the client counted, as before: 9 %).
- CI: the GitHub Actions run on their Node 24 majors.

## [v2.1.0] - 2026-10-01

### ✨ Features

- The sign-in method used last is remembered on every successful sign-in and
  shown as a "Last used" badge: on the account page, and on the sign-in page
  when Google is configured (two options to choose from). The sign-in page
  reads it from a cookie that holds only the method name (see `SECURITY.md`).

### 🔧 Changed

- `User.primaryAuthMethod` is replaced by `User.lastLoginMethod`
  (`credentials` or `google`). The old column was written at the first
  sign-in and never updated, and the account page showed a separately computed
  value; there is now one source. `/api/account/info` returns
  `lastLoginMethod` instead of `primaryAuthMethod`.
- The account page no longer shows the "Primary" and "Backup" badges.
- Unlinking Google clears `lastLoginMethod` if Google was the method used last.

### ⬆️ Upgrading a database from v2.0.0

- The schema drops a column. `pnpm prisma:push` refuses when a row still has
  a value in `primaryAuthMethod`; in that case run this once:
  `pnpm exec prisma db push --accept-data-loss`.
  A new database needs nothing.

### 🧪 Tests

- Jest: 467 tests (was 431). Playwright: 82 tests (was 79).

## [v2.0.0] - 2026-10-01

Security and accuracy pass after a code audit (details in the commit history
and in `SECURITY.md`).

### 🔒 Security

- Dependencies patched: `pnpm audit` 0 advisories (was 105, 54 in production
  dependencies, incl. the Next.js RSC / Server Actions and image-optimizer
  RCEs, the middleware authorization bypass and the next-auth `auth()`
  fail-open)
- `ENCRYPTION_KEY` required everywhere (no fallback key); example secrets
  refused in production
- Database-backed account lockout; sign-in throttling per e-mail **and** IP
  (IPv6 addresses were ignored before)
- TOTP ±30 s window actually applied (it was 0)
- Sessions: 7-day idle timeout by default (`SESSION_MAX_AGE`)
- Server auth code no longer shipped to the browser (CI check)
- Account security state never cached or invented on errors; bounded
  web-vitals store; `/api/health` no longer echoes database errors nor reports
  healthy servers as unhealthy; dev mock-session endpoint removed
- A session secret is required in every environment; the E2E run can no
  longer wipe the development database

### 🧪 Tests

- Playwright suite rewritten so every test can fail (79 tests); Jest grows
  from 292 to 431 tests for the security changes
- The Playwright suite runs in CI (`e2e` job) with Playwright retries off;
  the helpers' silent retry of session requests is gone

### 🧹 Types

- No explicit `any` is left in `src/` and `scripts/` (160 removed); the lint
  rule is now an error
- `/api/account/info`: for a user with both a password and Google,
  `primaryAuthMethod` no longer compares against a column that does not
  exist; the answer is unchanged (`email`)

### 📝 Docs

- README, SECURITY.md and docs/ checked claim by claim against the code;
  demo content and limitations stated explicitly

### ⚠️ Breaking

- Without a valid `ENCRYPTION_KEY` the app is not served in any environment
  (start-up validation). 2FA secrets encrypted with the old development fallback cannot
  be decrypted: affected users must enroll again.
- Google sign-in is offered only when both Google variables are set.

## [v1.1.0] - 2025-08-01

### ✨ Features

- Upgraded TailwindCSS from v3.4.16 → v4.1.11
- Updated `postcss.config.js` to use `@tailwindcss/postcss`
- Migrated `globals.css` to new `@import` syntax
- Refactored styling using `@layer` instead of legacy `@apply`
- Replaced deprecated `@types/bcryptjs` with native types

### 🔧 Dependency Upgrades

- TypeScript: 5.8.3 → 5.9.2
- PostCSS: 8.4.49 → 8.5.6
- Autoprefixer: 10.4.20 → 10.4.21
- Lucide React: 0.535.0 → 0.536.0

### 🛠 Fixes

- Resolved issues with `searchParams` typing in Next.js 15
- Ensured backward compatibility with previous CSS structure

### 🧪 QA

- Build verified (dev + prod)
- Linting & TypeScript checks passing
- i18n rendering and form UX validated

---
