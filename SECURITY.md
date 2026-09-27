# Security Policy

This is an authentication starter built on **Next.js 15** and **Auth.js (NextAuth
v5)**, written as a personal study project. This document explains how to report
a vulnerability, what the code actually does to protect you, and — just as
important — the **limitations** you must account for before running it in
production. Every statement below refers to code in this repository.

---

## Reporting a Vulnerability

**Please do not open a public issue for security vulnerabilities.**

- **Preferred:** use GitHub's private vulnerability reporting — the **Security**
  tab → **"Report a vulnerability"** — which opens a private advisory with the
  maintainer.
- You can also reach the maintainer through their GitHub profile.

When reporting, please include a description of the issue and its impact, steps
to reproduce (a minimal proof-of-concept is ideal) and the affected commit.

**What to expect:** this project is maintained on a best-effort basis. Reports are
acknowledged as soon as possible; please allow a reasonable window for a fix
before any public disclosure.

---

## Supported Versions

This project is a template rather than a versioned library. Security fixes land on
the default branch; run the latest `main`.

| Version         | Supported |
| --------------- | --------- |
| `main` (latest) | ✅        |
| older commits   | ❌        |

---

## Security Features

### Authentication

- **Sessions** use the Auth.js **JWT strategy**: the session is an **encrypted**
  token (JWE, `A256CBC-HS512`, key derived from `AUTH_SECRET` /
  `NEXTAUTH_SECRET`) in an HttpOnly cookie. Idle lifetime `SESSION_MAX_AGE`
  seconds, default **7 days** (sliding — see Known Limitations).
- **Password hashing** with **bcrypt**, cost **12** by default (`BCRYPT_ROUNDS`,
  4–15, applies to registration and password change; other code paths use 12).
- **Two-factor authentication (TOTP, `otplib`)** is **enforced for e-mail +
  password sign-in** inside the credentials `authorize()`: without a valid code
  the sign-in is refused and the form asks for the authenticator code.
  - Verification window **±1 time step (±30 s)**, covered by a unit test.
  - Single-use **backup codes** are verified and removed on the server.
  - TOTP secrets and backup codes are **encrypted at rest** (see
    `ENCRYPTION_KEY` below).
- **Account lockout** (database-backed, shared by all instances) for **e-mail +
  password sign-in**: after `MAX_LOGIN_ATTEMPTS` (default 5) consecutive
  failures — wrong password or wrong 2FA code — that sign-in is locked for
  `ACCOUNT_LOCKOUT_DURATION` minutes (default 15). A locked account gets the
  same generic answer as a wrong password, even with the right password; an
  active lock is not extended; a successful sign-in resets the counter; the
  lock is recorded as an `account_locked` security event. Google sign-in and
  existing sessions are not affected by the lock.
- Unknown e-mails cost the same bcrypt comparison as real ones.
- **CSPRNG tokens** for e-mail verification and account linking:
  `crypto.randomBytes` with rejection sampling to avoid modulo bias.

### Authorization

- Account server actions and account API routes take the user's identity from
  the **session**, never from a client-supplied id. Exceptions by design: the
  public "send verification e-mail" action acts on the address it is given
  (rate-limited), and the e-mail-verification and link-confirmation actions
  act on the owner of the token in the link.
- **Roles** (`USER`, `PRO_USER`, `ADMIN`): protected pages check the session
  and role on the server and redirect; `withRole()` guards role-restricted API
  routes (`/api/admin/metrics` — ADMIN only, covered by tests).

### Abuse prevention (rate limiting)

In-memory, best-effort limits keyed by **account or e-mail _and_ client IP**
(blocked if either key is over its limit):

| Flow                                                   | Limit                             |
| ------------------------------------------------------ | --------------------------------- |
| Failed credential sign-ins                             | `AUTH_RATE_LIMIT` (10) per minute |
| Failed 2FA codes                                       | 5 per 15 min, per account         |
| Registration                                           | 5 per hour                        |
| Verification e-mails                                   | 5 per 15 min                      |
| Wrong passwords when linking / unlinking / changing it | 5 per 15 min                      |

Sign-in answers with the generic invalid-credentials error (`2fa_invalid` for a
throttled 2FA code). The link / unlink API routes answer **HTTP 429 +
`Retry-After`**; server actions return a "Too many … attempts" message. The
client IP is the first parseable entry of `X-Forwarded-For` (IPv4 or IPv6, any
notation), then `X-Real-IP`, then `X-Client-IP`; with none of them there is no
IP key and only the account / e-mail key applies.

### Configuration & secrets

- **Environment validation** (Zod, `src/lib/env.ts`, loaded from
  `instrumentation.ts`) runs when the server initialises — at start-up under
  `next dev`, on the first request under `next start`, never during
  `next build`. On failure the process keeps running but serves nothing (every
  request errors) and the log lists the variable **names**, never values.
  - Required in **every** environment: `DATABASE_URL`, `ENCRYPTION_KEY`
    (exactly 64 hex characters) and a session secret (`AUTH_SECRET` or
    `NEXTAUTH_SECRET`, ≥ 32 characters).
  - In production `NEXTAUTH_URL`, when set, must be `https://`; Google
    credentials must be set together or not at all; `SESSION_MAX_AGE` must be
    300 – 2 592 000 seconds.
  - **Published example secrets are refused in production**: the `.env.example`
    and CI values of `AUTH_SECRET` / `NEXTAUTH_SECRET` and `ENCRYPTION_KEY`,
    and the `RESEND_API_KEY` placeholders (`re_...`, `your-resend-api-key`).
    Other example values (such as the local database password) are not
    checked.
- There is **no fallback encryption key** anywhere in the code.
- CI fails if the client chunks in `.next/static` contain one of three
  server-only markers (the credentials check, the user repository, Prisma) — a
  canary against shipping server code to the browser, not a proof.

### Transport & HTTP headers

Applied to all routes via `next.config.ts`:

- `Content-Security-Policy` — `default-src 'self'`; `object-src 'none'`;
  `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`;
  `upgrade-insecure-requests` (production); scripts and styles
  `'self' 'unsafe-inline'` (see Known Limitations); images also from
  `lh3.googleusercontent.com`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-XSS-Protection: 1; mode=block` (legacy; current browsers ignore it — the
  CSP is what matters)

### Auditability

The `SecurityEvent` table records: 2FA enabled / disabled; verification e-mail
sent and e-mail verified (both stored as `email_verified`, told apart by
`details`); account-link initiation (`account_link_initiated`, written after
the password check, before the Google step), unlinking (`account_unlinked`),
wrong passwords when linking / unlinking; account lockouts. **Not recorded**
(console or in-memory only): sign-ins, failed sign-ins, the completed Google
link, password changes, adding a password, backup-code use, account deletion.
Security events are deleted together with the account (`onDelete: Cascade`),
and the link / unlink events store the raw `X-Forwarded-For` header.

---

## Known Limitations & Hardening Notes

Read these before deploying. They are real, not hypothetical.

- **Sessions cannot be revoked one by one.** A session is a self-contained
  encrypted token; the server stores no session record. Role, name and 2FA flag
  are copied into the token **once, at sign-in**. Until the token expires:
  a **role change** has no effect (a demoted `ADMIN` still passes admin checks);
  **changing the password** or **enabling / disabling 2FA** does not end other
  sessions; **deleting the account** signs out only the browser that did it;
  **signing out** clears the cookie in that browser only. `SESSION_MAX_AGE` is a
  **sliding idle timeout**: every `GET /api/auth/session` (the app's session
  provider polls every 5 minutes and on window focus) re-issues the token, so an
  open tab keeps its session alive. The only kill switch today is **rotating
  the session secret**, which signs out everyone. Per-user revocation needs a
  check in the `jwt` callback (re-read the user or a token version on each
  session check) at the cost of one database lookup.
- **Google sign-in is not challenged for a TOTP code.** 2FA is enforced only for
  e-mail + password sign-in; a user who enabled 2FA and linked Google can sign
  in with Google alone.
- **Linking Google is not gated by the password check on the server.** The
  account page asks for the password (`/api/auth/link-account/initiate`) before
  starting Google sign-in, but Auth.js links any Google account that a
  signed-in user completes OAuth with, whether or not that check ran.
- **Sensitive actions do not require re-authentication**: disabling 2FA,
  adding a password to a Google account and deleting the account need only a
  session. Together with the previous points, a hijacked session can turn 2FA
  off, set its own password or delete the account.
- **TOTP codes are not marked as used**: a captured code can be replayed within
  its validity window (up to about 90 s). **Backup-code removal is not
  atomic**: two concurrent sign-ins can both accept the same code.
- **Backup codes cannot be entered in the sign-in form** (it accepts a 6-digit
  TOTP code only), although the server verifies and removes them.
- **In-memory rate limiting is per-process and best-effort.** Counters are not
  shared across instances (serverless / horizontally scaled deployments
  multiply the limits) and reset on restart; under `next dev` they can also
  reset when routes are recompiled. The store is an LRU of 20 000 keys, so a
  flood of distinct keys can evict existing counters. The IP key comes from
  headers the client controls unless a trusted proxy **overwrites**
  `X-Forwarded-For`. Back the limiter with a shared store (Redis / Upstash) in
  production. The database lockout does not have these limits.
- **Lockout can be used against a victim**: anyone who knows an e-mail address
  can lock that account's password sign-in for `ACCOUNT_LOCKOUT_DURATION`
  minutes by failing `MAX_LOGIN_ATTEMPTS` sign-ins, again and again. There is no
  self-service unlock and **no password-reset flow**.
- **Account enumeration**: registration answers "User already exists"; the
  verification-e-mail action works by address; on a 2FA account a correct
  password is answered with the 2FA step (`2fa_required`), which confirms the
  password. A failed sign-in on an existing account also waits for the lockout
  counter writes, so response time can reveal that the account exists.
- **2FA secret encryption** uses CryptoJS AES-256-CBC with the key derived from
  `ENCRYPTION_KEY` as a passphrase (OpenSSL `EVP_BytesToKey`, MD5, one
  iteration) and **no MAC**. During enrollment the encrypted pending secret is
  sent to the browser and the ciphertext it returns is decrypted and stored —
  keep the pending secret on the server instead before production. There is no
  key rotation: after changing `ENCRYPTION_KEY`, users with 2FA can no longer
  sign in with e-mail + password until an operator clears `twoFactorEnabled`,
  `twoFactorSecret` and `backupCodes`; then they can enroll again. For
  production prefer **AES-256-GCM** with a managed key (KMS).
- **The Content-Security-Policy uses `script-src 'unsafe-inline'`.** It is a
  static header applied to every response, including statically prerendered
  pages, so it cannot carry per-request nonces; Next.js emits inline hydration
  scripts. The structural directives (`object-src 'none'`, `base-uri 'self'`,
  `frame-ancestors 'none'`, `form-action 'self'`) still hold. A nonce-based
  `script-src` requires dynamic rendering.
- **E-mail is simulated whenever `RESEND_API_KEY` is unset — in every
  environment, production included** — and reported as sent. Set a real key,
  an `EMAIL_FROM` on a domain verified in Resend (the default
  `noreply@authapp.com` will be rejected) and `NEXTAUTH_URL` (e-mail links are
  built from it) before going live.
- **Public endpoints**: `/api/health` reports status, uptime, memory usage,
  `NODE_ENV` and the package version (database errors are logged, not
  returned); `/api/analytics/web-vitals` accepts metrics and returns aggregates
  without authentication — an in-memory demo store of at most 1000 validated,
  size-capped entries whose aggregates anyone can skew.
- **`next-auth` v5 is a beta** (pinned to `5.0.0-beta.32`); keep it pinned and
  review its changelog before upgrading.
- **No migration files** — the starter uses `prisma db push`; baseline your own
  migrations for production.
- This is a **starter/template** from a study project. Review the checklist
  below before production.

---

## Production Hardening Checklist

- [ ] Generate unique secrets: `AUTH_SECRET` (`openssl rand -base64 32`) and
      `ENCRYPTION_KEY` (`openssl rand -hex 32`). The published example values
      are rejected in production; never commit real ones.
- [ ] Never run `pnpm db:seed` or `pnpm create-user` against production, and
      delete the demo accounts (`admin@example.com` / `Admin123!`, …) if they
      exist there.
- [ ] Serve over **HTTPS** and set `NEXTAUTH_URL` to the `https://` origin.
- [ ] Configure a real e-mail provider (`RESEND_API_KEY`, a verified
      `EMAIL_FROM`).
- [ ] Use a database with **TLS** (`sslmode=require`) and a least-privilege user.
- [ ] Back rate limiting with a **shared store** for multi-instance / serverless.
- [ ] Put a proxy in front that **overwrites** `X-Forwarded-For`.
- [ ] Decide on session lifetime (`SESSION_MAX_AGE`) and, if you need it,
      add per-user revocation (see Known Limitations).
- [ ] Require re-authentication for disabling 2FA, adding a password and
      deleting the account, and 2FA for Google sign-ins, if your threat model
      needs them.
- [ ] Tighten the **Content-Security-Policy** (nonces if you render dynamically;
      add any third-party origins you use).
- [ ] Rotate secrets periodically and monitor the security-event table.
- [ ] Keep dependencies patched (`pnpm audit`).

---

_This project is provided as-is; you are responsible for the security of your own
deployment._
