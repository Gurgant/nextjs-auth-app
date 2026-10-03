# Changelog

## [v2.4.0] - 2026-10-03

### 🔒 Security

- The page `/[locale]/link-account/confirm/[token]` is removed. It was the
  second half of an older way to link an account, by a link sent in an
  e-mail; nothing in the application sent that e-mail any more. Opened with a
  valid token, the page needed no session and, while answering a `GET`, set
  `User.hasGoogleAccount`, wrote a security event `account_linked` and sent a
  security-alert e-mail, although no Google account was linked. The address
  now answers 404.
- `POST /api/auth/link-account/initiate` no longer creates a link token and
  no longer returns `linkToken` and `expiresAt`, which the browser never
  used. Its checks are unchanged: session, rate limit, password.

### 🔧 Changed

- Linking and unlinking Google work as before: the account page checks the
  password, then the user signs in to Google (not measured against Google
  itself: the E2E suite checks the password step through the real route and
  database).
- The `account_link_initiated` security event no longer has `linkRequestId`
  in its metadata.
- Nothing writes an `account_linked` security event or sends an
  `account_linked` alert any more. Rows of that type in an existing database
  do not show that a Google account was linked (see `SECURITY.md`).

### 🗑️ Removed

- The Server Action `confirmAccountLinking` and `routes.linkAccount`.
- The Prisma model `AccountLinkRequest` and `User.accountLinkRequests`.
- The message namespace `AccountLinking` (13 keys) and, in `Errors`,
  `invalidLinkingToken`, `accountLinkingCompleted`, `linkingTokenExpired`,
  `failedToConfirmAccountLinking`; in `Success`, `accountLinked`: 18 keys,
  from all five message files. A project that still uses one of them
  compiles; next-intl then shows the key's path in place of the text (read in
  the source of use-intl 4.14.7, not measured).
- `"account_linked"` from the alert type of `src/lib/email.ts` and from the
  event type of `src/lib/security.ts`; the `gradient` prop of
  `FormPageLayout` and the gradient `green-blue`, which only the removed page
  used.

### ⬆️ Upgrading a database from v2.3.0

- The schema drops the table `AccountLinkRequest`. Measured on the test
  database: when the table is empty, `pnpm prisma:push` drops it without a
  question. When it holds rows, the push stops with exit code 1 and changes
  nothing; `pnpm prisma:push --accept-data-loss` then drops the table and
  leaves the users. The flag accepts every data-loss warning of that push, so
  check first that this table is the only one named. Versions up to 2.3.0
  wrote a row each time a user entered the right password to link Google, so
  a database where linking was started has rows. Details in
  `docs/DEPLOYMENT.md`.
- The test database needs the same push: `pnpm db:push:test`.

### 🧪 Tests

- Jest: 849 tests (was 803). Playwright: 90 tests (was 88).
- The link-initiation route has its first tests (31), and an E2E test checks
  that the old address answers 404.
- The E2E warm-up requests twelve entries (was ten): the link-initiation
  route and the not-found page are added.
- Coverage: 56 % of statements (was 55 %).

## [v2.3.0] - 2026-10-03

A clean-up of code that nothing used, decided item by item, and the defects
found on the way.

### 🔒 Security

- The public action that sends the verification e-mail put its `locale`
  argument unchecked into the e-mailed link and into the e-mail's HTML. Only
  the five supported locales are accepted now; any other value gets the
  default.
- No personal data stays in the in-memory lists of the events layer and of
  the command bus.
  - Events layer: removed a notification queue that gained an entry at every
    registration (e-mail address, name, user id) and at every password change
    (user id), was never emptied, sent nothing and marked its entries "sent";
    and an event store that kept full copies of up to 10,000 events. The two
    example listeners that remain keep ids and outcomes, and for errors the
    type and code only.
  - Command bus: its audit list (the newest 1,000 entries) kept each
    command's input with only the password fields redacted (for a
    registration the name and the e-mail address, also when it was refused),
    its output, the error text and the whole metadata. An entry now keeps the
    command name, the ids, the time, the duration, the outcome and, for a
    command that threw, the class name of the error. The shared command
    instances no longer keep the last run's metadata.
- Registration and password change took `ipAddress` and `userAgent` from the
  submitted form, so a client could put any text of any length into the
  command metadata. They come from the request now (the User-Agent cut to 512
  characters).
- A registration refused because the address is taken printed that address to
  the server console, in the details of the logged error. It now logs which
  field collided, not its value.
- Four Server Actions that nothing called are removed; one of them returned
  the linked-account rows, tokens included, to the signed-in user.
- The public collector `/api/analytics/web-vitals` is removed: an endpoint
  without authentication and without a rate limit that stored every valid
  metric anyone posted (up to 1,000 entries) and returned the aggregates to
  anyone. The application itself never sent it a metric that it accepted
  (read in the v2.2.0 source, not measured).

### 🔧 Changed

- Five actions take "user not found" from the message files instead of an
  English literal: two-factor set-up, enable and disable, sending the
  verification e-mail, adding a password. The three two-factor actions do the
  same for "not signed in"; in English, "You must be signed in." becomes "You
  are not authorized to perform this action". The account page now passes its
  locale to two-factor set-up and disable, which answered in English whatever
  the page's language; both accept only the five supported locales.
- `GET /api/admin/metrics` no longer returns the `performance` block (always
  zero), `alerts.slowOperations` and `alerts.slowQueries` (always empty) and
  `database.sessionCount` (always 0). `DELETE /api/admin/metrics`, which
  answered "cleared" while clearing nothing, is removed.
- `CommandExecutedEvent.payload.success` is true only when the command's
  answer has `success: true`; it was true for every command that returned, a
  refused one included. A command whose answer has no `success` field (none
  in the application) is now reported as not successful. The average command
  duration of the analytics listener no longer counts the newest run twice.
- The audit entries of the example listener have no `ipAddress` /
  `userAgent`; `getAnalyticsSummary().totals` has no `logins` /
  `failedLogins` (they could never rise above zero). The `[AUDIT]` lines that
  the audit listener prints to the server console have the same reduced
  details: the line of a command that threw no longer has the error text; the
  line of a critical error has the type and the code, no longer the message
  and the rest of the context.
- The entries of `AuditMiddleware.getAuditLogs()` have `success` and, for a
  command that threw, `errorType`; they no longer have `input`, `output`,
  `error` and `metadata`. `BaseCommand` keeps `commandId` in place of
  `metadata`. The development log line of the logging middleware reads
  "[Command:X] Completed".
- `LOG_LEVEL` and `SENTRY_DSN` are no longer read by anything.

### 🗑️ Removed

A project that imported one of these no longer compiles. Most had no caller
in the application; four were wired in: the notification handler and the
event store received every event (see Security), the account page started
`trackAccountPageMetrics`, and `/api/admin/metrics` read the performance
monitor, into which nothing recorded (see Changed).

- Events: `NotificationHandler`, `getNotificationHandler`,
  `processNotificationQueue`, `InMemoryEventStore`, `eventStore`,
  `getEventStore`, `getEventHistory`, `IEventStore`, `EventFilter`,
  `emitEvent` (use `eventBus.publish`), the catalogues `AuthEvents`,
  `SecurityEvents` and `SystemEvents`, and the 20 event classes that nothing
  published. Five events remain: `UserRegisteredEvent`,
  `PasswordChangedEvent`, `CommandExecutedEvent`, `CommandFailedEvent`,
  `ErrorOccurredEvent`.
- Server Actions `getUserAccountInfo`, `migrateUserAccountMetadata`,
  `initiateAccountLinking`, `getEnhancedUserAccountInfo`, and what only they
  used: `sendAccountLinkConfirmation`, `createAccountLinkTemplate` and
  `RATE_LIMITS.accountLink`. Also removed, without any caller: the
  data-access `getUserAccountInfo`, and `createGenericErrorResponseI18n` with
  its helper `translateCommonError`.
- 14 message keys, from all five message files: in `Errors`, `notFound`,
  `forbidden`, `serverError`, `unknown`, `alreadyExists`, `invalidInput`,
  `accountLinkingInProgress`, `failedToSendConfirmationEmail`,
  `failedToInitiateAccountLinking`, `failedToFetchAccountInfo`,
  `failedToMigrateAccountMetadata`; in `Success`, `accountMetadataUpdated`,
  `confirmationEmailSent`, `accountInfoRetrieved`. A project that still uses
  one of them compiles (the messages are not typed); next-intl then shows the
  key's path, such as `Errors.notFound`, in place of the text (read in the
  source of use-intl 4.14.7, not measured).
- Roles: `RoleGuard`, `RoleVisibility`, `useRole`, `hasExactRole`, `isAdmin`,
  `isProUser`, `requireRole` (`withRole` stays), and the unused members of
  `SafeNavigation` and `RouteValidator`.
- Forms: `useMultiStepForm`, `useSafeLocaleWithOptions`.
- Performance: `src/lib/performance/` (web vitals), `src/lib/monitoring/`
  (the performance monitor and its logger) and the dependency `web-vitals`.
- Routes: `/api/analytics/web-vitals` (`GET` and `POST`) and
  `DELETE /api/admin/metrics`.

### ⬆️ Upgrading from v2.2.0

- No schema change and no new setting.
- Search your own code for the 14 removed message keys (see Removed): a
  removed key fails at run time, not at compile time.

### 🧪 Tests

- Jest: 803 tests (was 721). Playwright: 88 tests (unchanged).
- The events layer has its first tests, with the real bus and listeners.
- The dead-code allow-list went from 21 entries to 1.
- Coverage: 55 % of statements (was 43 %).

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
