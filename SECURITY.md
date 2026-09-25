# Security Policy

This is an authentication starter built on **Next.js 15** and **Auth.js (NextAuth
v5)**. Security is treated as a first-class concern; this document explains how to
report a vulnerability, what protections ship by default, and — just as important
— the **honest limitations** you must account for before running it in production.

---

## Reporting a Vulnerability

**Please do not open a public issue for security vulnerabilities.**

- **Preferred:** use GitHub's private vulnerability reporting — the **Security**
  tab → **"Report a vulnerability"** — which opens a private advisory with the
  maintainer.
- You can also reach the maintainer through their GitHub profile.

When reporting, please include:

- A clear description of the issue and its impact.
- Steps to reproduce (a minimal proof-of-concept is ideal).
- The affected version / commit and environment.

**What to expect:** this is an open-source starter maintained on a best-effort
basis. We aim to acknowledge a report within a few business days, agree on a
disclosure timeline, and credit you (if you wish) once a fix is available. Please
practice responsible disclosure and give us a reasonable window to remediate
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

- **Sessions** via Auth.js (NextAuth v5) using the **JWT strategy** (30-day
  max age), signed with `AUTH_SECRET` / `NEXTAUTH_SECRET`.
- **Password hashing** with **bcrypt**, cost factor **12** in production
  (configurable 4–15 via `BCRYPT_ROUNDS`).
- **Two-factor authentication (TOTP)** built on `otplib`, **enforced at login**
  as a two-stage flow:
  - a strict **±30-second** verification window (no wide clock tolerance);
  - single-use **backup codes**;
  - TOTP secrets and backup codes are **encrypted at rest**.
- **CSPRNG tokens** for email-verification and account-linking flows — generated
  with Node's `crypto.randomBytes` plus rejection sampling to avoid modulo bias.

### Authorization

- **Identity is always derived from the authenticated session**, never from
  client-supplied identifiers — server actions and sensitive API routes ignore
  any `userId` passed by the client (IDOR-hardened).
- **Role-based access control** guards privileged endpoints (e.g. admin metrics
  are wrapped in an `ADMIN`-only handler).

### Abuse prevention (rate limiting)

- Best-effort **in-memory (LRU) rate limiting** on the sensitive entry points:
  credential login, 2FA code verification, registration, verification-email
  sends, account link/unlink password checks, and password changes.
- Counters are keyed by **account identifier _and_ client IP** (blocked if either
  is over its limit). API routes respond with **HTTP 429 + `Retry-After`**; server
  actions return a generic error. See **Known Limitations** for the important
  caveats.

### Configuration & secrets

- **Boot-time environment validation** (Zod, run from `instrumentation.ts`): the
  server **refuses to start** on missing/invalid critical configuration
  (`DATABASE_URL`, a signing secret, `ENCRYPTION_KEY`, an HTTPS URL in
  production). Validation errors list variable **names only** — never values.
- `ENCRYPTION_KEY` is **required in production** with no usable hardcoded
  fallback.

### Transport & HTTP headers

Applied to all routes via `next.config.ts`:

- `Content-Security-Policy` — `default-src 'self'`; `object-src 'none'`;
  `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`;
  `upgrade-insecure-requests`; scripts/styles `'self' 'unsafe-inline'` (see the
  note under Known Limitations)
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-XSS-Protection: 1; mode=block`

### Auditability

- **Security-event logging** (logins, 2FA events, password and account changes)
  provides an audit trail.

---

## Known Limitations & Hardening Notes

These are deliberate, documented trade-offs — read them before deploying.

- **In-memory rate limiting is per-process and best-effort.** Counters are **not
  shared across instances** (a horizontally-scaled, serverless, or edge
  deployment holds independent state, so effective limits multiply by the number
  of instances) and **reset on restart/redeploy**. One key is the client IP,
  which is only trustworthy behind a correctly-configured, **trusted
  `X-Forwarded-For`**. For production / multi-instance, back the limiter with a
  shared store (e.g. Redis/Upstash). A rate limiter is one layer — MFA, account
  lockout, and CAPTCHA remain the primary controls (per OWASP and NIST
  SP 800-63B).
- **2FA secret encryption** uses AES via CryptoJS (passphrase-derived key).
  For production, prefer **AES-256-GCM** with a KMS-managed key.
- **Environment validation runs at server cold start** (the `register()` hook),
  **not during `next build`** — a bad value is caught when the server boots,
  not at build time.
- **`ENCRYPTION_KEY` has an insecure development fallback** when unset in dev; it
  is **never** used in production (the app throws instead).
- **The Content-Security-Policy uses `script-src 'unsafe-inline'`.** It ships as a
  static header so it applies uniformly to every response — including the app's
  statically-prerendered i18n pages — which means it cannot carry a per-request
  nonce. Next.js emits inline hydration scripts, so `'unsafe-inline'` is required
  unless the whole app is forced to render dynamically. The high-value structural
  directives (`object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`,
  `form-action 'self'`) still hold and are the ones that stop the most damage.
  Tightening `script-src` to a nonce + `'strict-dynamic'` (which requires dynamic
  rendering) is on the roadmap.
- **Account-existence enumeration:** some flows may reveal whether an email is
  registered. Uniform responses/timing are a planned hardening.
- This is a **starter/template**. Review the checklist below before production.

---

## Production Hardening Checklist

- [ ] Generate strong, unique `AUTH_SECRET` (≥ 32 chars) and `ENCRYPTION_KEY`
      (64 hex chars) — never commit secrets. See `.env.example`.
- [ ] Serve over **HTTPS** and set `NEXTAUTH_URL` to the `https://` origin.
- [ ] Configure a real email provider (`RESEND_API_KEY`); dev **simulates**
      sending.
- [ ] Use a database with **TLS** (`sslmode=require`) and a least-privilege user.
- [ ] Back rate limiting with a **shared store** (Redis/Upstash) for
      multi-instance / serverless deployments.
- [ ] Tighten the **Content-Security-Policy** to your needs — e.g. a nonce-based
      `script-src` if you render dynamically, and add any third-party origins.
- [ ] If behind a proxy/load balancer/CDN, configure a **trusted
      `X-Forwarded-For`** so IP-based limits are accurate.
- [ ] Rotate secrets periodically and monitor the security-event log.
- [ ] Keep dependencies patched.

---

_This project is provided as-is; you are responsible for the security of your own
deployment._
