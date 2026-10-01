# Changelog

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
