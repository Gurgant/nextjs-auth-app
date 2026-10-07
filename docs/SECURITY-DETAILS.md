# Security: detail and measurements

The reference part of [`SECURITY.md`](../SECURITY.md). That file says in a few
lines what the application protects, which tests or measurements cover it and
where it stops. This one keeps the full text: the test that measures a
statement, or the date and the way of a measurement made outside the suite,
and what was read in a library's source and not measured. The entries of
`SECURITY.md` link to their place here: the headings of this file are their
link targets, so a heading that is renamed here has to be renamed in the link
there.

- [Protections: detail and measurements](#protections-detail-and-measurements)
- [Known limitations: the full text](#known-limitations-the-full-text)
  - [Sessions](#sessions)
  - [Second factor and sensitive actions](#second-factor-and-sensitive-actions)
  - [Linking Google needs the password, within these limits](#linking-google-needs-the-password-within-these-limits)
  - [Rate limiting, lockout and enumeration](#rate-limiting-lockout-and-enumeration)
  - [Stored data and cryptography](#stored-data-and-cryptography)
  - [Platform and operations](#platform-and-operations)

## Protections: detail and measurements

Two protections have their detail in other documents: the return address after
a sign-in, a link or a sign-out in [`docs/TESTING.md`](TESTING.md), under
"Return address", and the validation of input in
[`docs/ARCHITECTURE.md`](ARCHITECTURE.md), under "Server actions".

### Sign-in: passwords, lockout and response time

- **Password hashing** with **bcrypt**, cost **12** by default
  (`BCRYPT_ROUNDS`, 4–15, applies to registration, password change and adding
  a password to a Google account; the seed, `pnpm create-user` and the E2E
  fixtures always use 12).
- **Account lockout** (database-backed, shared by all instances) for **e-mail +
  password sign-in**: after `MAX_LOGIN_ATTEMPTS` (default 5) consecutive
  failures — wrong password or wrong 2FA code — that sign-in is locked for
  `ACCOUNT_LOCKOUT_DURATION` minutes (default 15). A locked account gets the
  same generic answer as a wrong password, even with the right password; an
  active lock is not extended; a successful sign-in resets the counter; the
  lock is recorded as an `account_locked` security event. Google sign-in and
  existing sessions are not affected by the lock.
- Unknown e-mails (and accounts without a password) are compared against a
  dummy hash of cost `BCRYPT_ROUNDS`, so they take as long as accounts hashed
  at that cost. With `BCRYPT_ROUNDS` other than 12, accounts hashed at cost 12
  (seeded users, users made with `pnpm create-user`, a password that was added
  to a Google account while that action still used a fixed cost of 12) answer
  at a different speed.

### Two-factor authentication

- TOTP (`otplib`) is **enforced for e-mail + password sign-in** inside the
  credentials `authorize()`: without a valid code the sign-in is refused and
  the form asks for the authenticator code.
  - Verification window **±1 time step (±30 s)**, covered by a unit test.
  - Single-use **backup codes** are verified and removed on the server. The
    code step of the form has a control that switches its field to a backup
    code (`src/components/auth/credentials-form.tsx`); the form then sends
    `backupCode` and no `totpCode`. `authorize()` compares it, without
    hyphens and spaces and in capitals, with the decrypted codes of the
    user, removes the one that matches from the row and goes on with the
    sign-in. Only a whole code is compared, eight letters and digits on
    both sides: "-" alone is no code, and neither is a row that the key
    cannot read. A code that matches none, also one that was used before, is a
    failed second factor like a wrong TOTP code: it counts toward the 2FA
    throttle (five in 15 minutes per account, in memory) and the database
    lockout, and the form gives one answer for both kinds of code. A request
    that carries both is checked for the TOTP code first; the backup code is
    looked at, and used up, only when that one is wrong (the form never
    sends both). Measured in a browser against the real server and database
    (`e2e/tests/backup-code.e2e.ts`): a code signs in, the row then holds
    one code fewer, the same code is refused the second time, and the next
    one signs in.
  - TOTP secrets and backup codes are **encrypted at rest** (see
    `ENCRYPTION_KEY` below).

### Sessions end on the server

- **Sessions** use the Auth.js **JWT strategy**: the session is an **encrypted**
  token (JWE, `A256CBC-HS512`, key derived from `AUTH_SECRET` /
  `NEXTAUTH_SECRET`) in an HttpOnly cookie. Idle lifetime `SESSION_MAX_AGE`
  seconds, default **7 days** (sliding — see "The idle timeout is sliding"
  below).
- Every time the token is decoded — by the session endpoint, by `auth()` in
  pages, actions and API routes, and at sign-out — it is checked against the
  database (`src/lib/auth/session-revocation.ts`, wired as `jwt.decode` in
  `src/lib/auth.ts`). Auth.js decodes it the same way when a Google sign-in
  returns to a browser that already has a session cookie: its decision
  function, run by the integration test with this check, takes a signed-out
  session for no session (measured); that the Google callback hands it the
  cookie was read in the source of `@auth/core` 0.41.3, not measured.
  - **Signing out** ends that session: its id is stored in `RevokedSession`,
    and a copy of the cookie, or a response that arrives late, no longer works.
    Other sessions of the same user are not touched.
  - **Changing the password** ends **every** session of the user, the one
    that changed it included (`User.sessionVersion` is incremented in the same
    `UPDATE` as the password); the account page then signs out and the
    success message asks to sign in again.
  - **Deleting the account** ends its sessions in every browser.
  - The **role** is re-read from the database at each check, so a role
    changed in the database applies at the next request.
  - When a lookup fails, the check **fails closed**: no session.
  - Sign-out, password change, account deletion and the role are covered by
    E2E tests (`e2e/tests/session-revocation.e2e.ts`), failing closed by unit
    tests. See "Sessions" under the known limitations below for what all
    this does not cover.

### Linking Google needs the password

A Google account is linked to an existing user only after that user's password
was checked on the server, within 5 minutes of the check and once per check.
The password step (`POST /api/auth/link-account/initiate`) records a grant on
the user's row (`User.linkGrantProvider`, `User.linkGrantExpiresAt`). Auth.js
writes `Account` rows through one method of its adapter, and the application
wraps that method (`src/lib/auth/link-gate.ts`): onto an existing user it
links only after it has spent the grant, in one `UPDATE`, and only when the
user row it read before that shows no Google account (two password steps whose
links overlap can each link one: see "Not one transaction" below). Otherwise
it refuses: no `Account` row is written, Google's tokens are not stored, an
`account_link_refused` event is recorded, and the browser is sent to a page
that says what happened and how to link. A first Google sign-in of a new
visitor needs no grant. Up to version 2.4.0 Auth.js linked any Google account
that was not linked to a user yet, when a signed-in user completed a Google
sign-in with it.

- **Measured** on 2026-10-05 on real PostgreSQL (the integration test, see
  `docs/TESTING.md`), through the adapter object the application hands to
  Auth.js and through Auth.js's own decision function (`handleLoginOrRegister`
  of `@auth/core` 0.41.3) run with that adapter: a live session without the
  password step links nothing; after the password step one account is linked,
  and a second attempt is refused; a grant ends 300 seconds after the password
  step (compared by PostgreSQL) and is bound to its user and to its provider;
  of two attempts that overlap on one grant, one links (of two that overlap
  with a grant each, both do: see "Not one transaction" below); a new visitor
  is created and linked; a returning Google user signs in and nothing is
  linked; a signed-out session counts as no session. Measured in a browser
  (`e2e/tests/account-linking.e2e.ts`): the real route writes the grant and
  links nothing, and the address a refused link is sent to shows the refusal
  in the visitor's language.
- **Read in the source of `@auth/core` 0.41.3, not measured** (no test
  completes a Google sign-in, and no run against Google was made): the
  exchange with Google before that function; that Auth.js answers the gate's
  refusal with a redirect, without a new session cookie and without the
  `signIn` event; and that this redirect ends on the refusal page and not on
  the "Configuration Error" page (see "The refusal page depends on request
  context" below). A unit test
  (`src/test/unit/__tests__/authjs-source-pin.test.ts`) fails when one of the
  files that were read is no longer the file that was read.

### For a Google account the application stores which user it belongs to, and none of Google's tokens

An `Account` row holds `userId`, `type`, `provider` and `providerAccountId`.
With the account, Auth.js hands its adapter what Google's token endpoint
answered: `access_token`, `id_token`, `expires_at`, `scope`, `token_type` and,
because `src/lib/auth-config.ts` asks Google for offline access
(`access_type: "offline"`, `prompt: "consent"`), a `refresh_token` (read in
the source of `@auth/core` 0.41.3, `lib/utils/providers.js`, not measured
against Google: no test completes a Google sign-in). The link gate, through
which Auth.js writes an `Account` row, hands the Prisma adapter the four
values only (`identityOf` in `src/lib/auth/link-gate.ts`), and the token
columns of the row stay `NULL`.

Measured on 2026-10-06 on real PostgreSQL (the integration test), for the
first sign-in of a new visitor and for a link after the password step, through
the adapter object the application hands to Auth.js and through Auth.js's
decision function, each handed all seven values of a token response: the rows
hold none of them, while Auth.js's own `linkAccount` event still receives
them.

Nothing reads these columns: the application calls no Google API and refreshes
no token (a search of the repository for the column names finds the Prisma
schema, the type declaration, tests, test builders and the seed of the E2E
suite, and no other code), and Auth.js looks a Google account up by its
provider and account id and takes the user of the row (read in the source of
`@auth/core` 0.41.3 and of `@auth/prisma-adapter` 2.11.3; a returning Google
user whose row holds no token signs in, measured with Auth.js's decision
function). The columns stay in the schema: it is the `Account` model that
Auth.js documents for its adapters (`adapters.js` of `@auth/core` 0.41.3). A
project that needs the tokens (to call a Google API) returns the whole account
from `identityOf`, and should encrypt them first.

What the rows of earlier versions hold, and the refresh token that Google is
still asked for, is under
[Google's tokens in rows of earlier versions](#googles-tokens-in-rows-of-earlier-versions)
below.

### Random tokens

**CSPRNG tokens** from `crypto.randomBytes`: e-mail-verification tokens are
drawn from a 62-character alphabet with rejection sampling (no modulo bias);
backup codes use the same generator, upper-cased.

### Last sign-in method

A successful sign-in stores the method (`credentials` or `google`) on the user
row and in the cookie `last-login-method` (1 year, `SameSite=Lax`, `Secure` in
production). The cookie is **not HttpOnly on purpose**: the sign-in page reads
it to mark the option used last, and it only ever holds one of those two words
— never an account identifier. It is validated on read; any other value is
ignored. On a shared browser it tells the next person which method was used
last. Signing out does not remove it.

### E-mail verification through Google

A Google sign-in marks the e-mail verified only when Google's ID token carries
`email_verified: true` for the address stored on the user (compared without
regard to case). This is decided in one place
(`src/lib/auth/google-email-verification.ts`, called from the `jwt` callback),
for a new user at the first sign-in, for an existing user and when Google is
linked to a signed-in user. A verification date that is already set is kept,
and a sign-in never clears it. A refused Google sign-in
(`OAuthAccountNotLinked`) does not change `emailVerified`: the `signIn`
callback, which runs before Auth.js accepts or refuses, does not write it. The
callbacks are covered by unit tests; the order in which Auth.js calls them
(`signIn` before the decision, `jwt` only after an accepted sign-in) was read
in the source of `@auth/core` 0.41.3, not measured against Google.

### Authorization

- Account server actions and account API routes take the user's identity from
  the **session**, never from a client-supplied id. Exceptions by design: the
  public "send verification e-mail" action acts on the address it is given
  (rate-limited), and the e-mail-verification action acts on the owner of the
  token in the link.
- **Roles** (`USER`, `PRO_USER`, `ADMIN`): protected pages check the session
  and role on the server and redirect; `withRole()` guards role-restricted API
  routes (`/api/admin/metrics` — ADMIN only, covered by tests).

### Abuse prevention: answers, client IP and keys

The limits themselves are the table of `SECURITY.md`, under "Abuse prevention
(rate limiting)".

Sign-in answers with the generic invalid-credentials error (`2fa_invalid` for
a throttled 2FA code). The link / unlink API routes answer **HTTP 429 +
`Retry-After`**; server actions return a "Too many …" message in the locale
they resolve (`docs/ARCHITECTURE.md`, "Server actions"). The client IP is the
first parseable entry of `X-Forwarded-For` (IPv4 or IPv6, any notation), then
`X-Real-IP`, then `X-Client-IP`; with none of them there is no IP key and only
the account / e-mail key applies. Registration and the verification-e-mail
action count an attempt before the address is validated: the key they build
from it is the address in lower case, cut to 254 characters, and a value that
is not text gets no e-mail key.

### Configuration & secrets

- **Environment validation** (Zod, `src/lib/env.ts`, loaded from
  `instrumentation.ts`) runs when the server initialises — at start-up under
  `next dev`, on the first request under `next start`, never during
  `next build`. On failure the process keeps running but serves nothing (every
  request errors) and the log lists the variable **names**, never values.
  - Required in **every** environment: `DATABASE_URL`, `ENCRYPTION_KEY`
    (exactly 64 hex characters) and a session secret (`AUTH_SECRET` or
    `NEXTAUTH_SECRET`, ≥ 32 characters).
  - In every environment Google credentials must be set together or not at
    all and `SESSION_MAX_AGE` must be 300 – 2 592 000 seconds; in production
    `NEXTAUTH_URL`, when set, must also be `https://`.
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
  `'self' 'unsafe-inline'` (see "The Content-Security-Policy uses
  `script-src 'unsafe-inline'`" below); images also from
  `lh3.googleusercontent.com`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-XSS-Protection: 1; mode=block` (legacy; current browsers ignore it — the
  CSP is what matters)

### Security events

The `SecurityEvent` table records: 2FA enabled / disabled; verification e-mail
sent and e-mail verified (both stored as `email_verified`, told apart by
`details`); account-link initiation (`account_link_initiated`, written after
the password check, in one transaction with the link grant, before the Google
step), a Google account linked to an existing user (`account_link_completed`,
written by the link gate after the `Account` row, with the provider and the
Google account id), a refused link (`account_link_refused`, with the provider
and the reason: `no_grant` or `already_linked`), unlinking
(`account_unlinked`, with the provider, the number of `Account` rows that were
removed and the accounts the route had read), wrong passwords when linking /
unlinking; account lockouts.

Each records the client IP as the rate limiter reads it (a valid address or
none, see "Abuse prevention") and at most the first 512 characters of the
`User-Agent`; the two events of the link gate record neither, because Auth.js
hands an adapter no request.

What is not recorded, and what the rows of earlier versions hold, is under
[What the security events do not record](#what-the-security-events-do-not-record)
and [Security events of earlier versions](#security-events-of-earlier-versions)
below.

## Known limitations: the full text

Read these before deploying.

### Sessions

**Sessions are checked on the server, but there is no list of them.** A
session is still an encrypted token. The server stores only what ends one: a
row per signed-out session (`RevokedSession`) and a counter per user
(`User.sessionVersion`). What that leaves open:

#### No session list

The server cannot show a user's sessions or devices and cannot end one _other_
session: only the session whose cookie is presented (sign-out) or all sessions
of a user (password change, account deletion). "Active Sessions" on the admin
page stays 0: it counts the Auth.js `Session` table, which JWT sessions never
write to. Signing in again over an existing session issues a new session and
does not end the previous token (read in the source, not measured).

#### What does not end a session

Enabling or disabling 2FA, adding a password to a Google account and linking
or unlinking Google do not end sessions.

#### Only the role is re-read

Name, e-mail, the e-mail verification date and the 2FA flag in the session are
the copy taken at sign-in. The dashboards and the account page's profile card
(name, e-mail) show that copy: a name change is saved, but appears there only
after the next sign-in.

#### Sign-out is final only if it reaches the server and the database

Clearing the cookies or closing the browser revokes nothing: a copy of that
cookie keeps working. The same holds when the database fails during the
sign-out. Measured on 2026-10-02 against `next dev`, with the `RevokedSession`
table renamed away so that every query on it fails: the sign-out answered 200
and cleared the cookie in that browser, Auth.js logged `SignOutError`, no row
was written, and a copy of the token was accepted again once the table was
back. When the lookups succeed and only the write of the revocation row fails,
the sign-out answers the same way and revokes nothing, and the log line is
`EventError`, not `SignOutError` (read in the source of `@auth/core` 0.41.3,
not measured).

#### A revocation row is kept for 30 days

Thirty days are the longest `SESSION_MAX_AGE` the app accepts, and the row is
kept that long whatever the configured value is: a copy of the token minted
before the lifetime was lowered still carries the longer one, and the row has
to outlive it. Expired rows are deleted at the next sign-out.

#### The idle timeout is sliding

`SESSION_MAX_AGE` is a **sliding idle timeout**: every `GET /api/auth/session`
(the app's session provider polls every 5 minutes and on window focus)
re-issues the token, so an open tab keeps its session alive, and a session
request that is still in flight when a sign-out completes can put a cookie
back into the browser. It is the cookie of the ended session: the server
refuses it and the next request to the session endpoint removes it. Measured
in the E2E suite on 2026-10-02 with a test that polls the session endpoint
right after the sign-out click, 20 repetitions each: before the check existed
the browser stayed signed in in 8 of 20 (4 of 20 in an earlier measurement);
with the check in 0 of 20, and in 6 of those 20 the server log shows a refused
token of the ended session.

#### Every session check needs the database

Each check is two primary-key lookups (the user row and the revocation row;
measured in the query log of `next dev`: 2 `SELECT`s for one
`GET /api/auth/session`, 4 for `/en/account`, which calls `auth()` twice).
When a lookup fails the check fails closed. Measured as above, with the table
renamed away: `GET /api/auth/session` answered `null` and **cleared the
cookie**, so a browser that asks the session endpoint during a database
failure has to sign in again: the app's session provider asks it on every full
page load, on window focus and every 5 minutes. A bare request to
`/en/account` (which uses `auth()`), without the page's JavaScript, was
redirected as signed out and kept its cookie, and that cookie was accepted
again once the table was back. Auth.js logged `JWTSessionError` each time. A
database that cannot be reached at all was not measured.

#### A refused token is logged as an error

Each session check (the session endpoint or `auth()`) that meets the token of
an ended session makes Auth.js log a `JWTSessionError` ("Invalid JWT") at
error level, with a stack trace; a sign-out with such a token logs no error
(the app's own line then reads `User signed out: { userId: undefined }`). The
error is logged in ordinary use too: after a password change, every other
browser of the user causes it at its next session check.

#### Tokens issued before this check existed are refused

They carry no session id: after upgrading, every user signs in once.

#### Code that decodes the token without the session check

Another service that holds the secret, or `getToken()` from `next-auth/jwt`
with its default `decode`, does not run the check described here: it does not
see a sign-out, a password change, a deleted account or a role that was
changed in the database. The app uses neither (read in the source, not
measured).

#### Rotating the session secret

It is still the only way to end every session of every user at once.

### Second factor and sensitive actions

#### Google sign-in is not challenged for a TOTP code

2FA is enforced only for e-mail + password sign-in; a user who enabled 2FA and
linked Google can sign in with Google alone.

#### Sensitive actions do not require re-authentication

Disabling 2FA, adding a password to a Google account and deleting the account
need only a session. Together with the previous points, a hijacked session can
turn 2FA off, set its own password or delete the account. For an account that
signs in with Google only, setting a password is also the way round the link
gate: with that password the session can unlink Google and link another Google
account. Changing the password (which asks for the current one) ends a
hijacked session along with every other session of the user.

#### TOTP codes are not marked as used

A captured code can be replayed within its validity window (up to about 90 s).
**Backup-code removal is not atomic**: two concurrent sign-ins can both accept
the same code.

#### Backup codes are made once

The eight codes are made when 2FA is enabled (`enableTwoFactorAuth`), shown
in the set-up dialog and offered as a text file; the last button of the
dialog stays disabled until the file was downloaded. Afterwards the account
page shows how many are left and never the codes, and no action makes new
ones. Only disabling 2FA and enabling it again does (which needs only a
session, see above); the disabling deletes the old codes. A user who has
used all eight and loses the authenticator cannot finish an e-mail +
password sign-in. The downloaded file says the first two things: that new
codes come only from disabling 2FA and enabling it again, and that its own
codes then stop working.

### Linking Google needs the password, within these limits

#### The grant belongs to the user, not to the browser

From a correct password step until its grant is spent, **any** live session of
that user can complete a Google sign-in and have its own Google account
linked: a copy of the session cookie, another device, the same browser left
unattended. That is normally a matter of seconds, and the full 5 minutes when
the Google step is abandoned, or when Auth.js itself refuses it because the
chosen Google account belongs to another user (that refusal does not spend the
grant: measured). The owner's own attempt is then refused, while the account
page shows Google as linked; it does not show which Google account. What a
session could do at any time without the password, it can now do only while
the owner is linking. The link leaves an `account_link_completed` event with
the Google account id; nobody is notified.

#### A grant is not withdrawn

It survives a sign-out, a password change and a cancelled Google step, until
it is spent or its 5 minutes are over. Only a live session can use it, and a
password change ends every earlier session.

#### It is as strong as the password step

That step asks for no TOTP code, and its throttle is the in-memory one (5
wrong passwords per 15 minutes, per process; see the rate-limiting limits
below). A wrong password there does not count toward the database lockout.

#### Accounts that sign in with Google only

They are not protected against a hijacked session. The gate refuses them a
second Google account (they have no password to confirm with; up to version
2.4.0 it was linked without a question). But adding a password needs only a
session (see "Sensitive actions do not require re-authentication" above), and
with that password the holder of the session can unlink Google and link
another Google account.

#### "New user" is read from the row

A user without a password, without an `Account` row and with an e-mail that is
not verified is taken for the row Auth.js created a moment before, and is
linked without a grant. No path of this application leaves a signed-in user in
that state: registration writes a password and an `Account` row, and unlinking
needs a password. A provider you add that signs users in without any of the
three, or an edit of the database by hand, reopens the hole for those users.
The other way round: an event or a provider of your own that writes a
password, an `Account` row or `emailVerified` between Auth.js's `createUser`
and its `linkAccount` makes first Google sign-ins fail, and the user row that
is left behind then blocks that address (`OAuthAccountNotLinked`). Measured on
2026-10-05 with Auth.js's decision function and a `createUser` event that sets
`emailVerified`; a row left behind with none of the three blocks its address
in the same way (measured).

#### `allowDangerousEmailAccountLinking`

The option links what a first sign-in links, and what a live grant allows.
With that provider option, which the application does not set, Auth.js links a
Google account to the user who has the same e-mail address, without a session.
The gate refuses that link onto a user that has a password, an `Account` row
or a verified e-mail and no live grant. A row with none of the three is linked
without a grant, as the row of a first sign-in is. Measured on 2026-10-05 with
Auth.js's decision function and that option (the integration test), not
against Google. While a grant of that user is live (up to 5 minutes after a
correct password step, see "The grant belongs to the user, not to the browser"
above), the gate links one Google account to a user that has none, and with
this option Auth.js asks for no session on the way there (read in the two
sources, not measured).

#### Not one transaction

The gate reads the user row, spends the grant and writes the `Account` row in
three statements. Whether the user already has a Google account is taken from
the row as it was read before the spend, so two password steps whose Google
steps return at the same moment can link **two** Google accounts to one user.
Measured on 2026-10-05 at the adapter: the integration test holds the first
link back between its spend and its write; at that moment the database shows
no grant and no Google account for the user, the state in which the password
step writes a grant (the test writes the second one itself), and both links
are then made. It takes the password twice, so it is no way round the gate.

One unlink removes every Google `Account` row that such a user has when its
`DELETE` runs, in the transaction that clears the `hasGoogleAccount` flag of
the user row, and its `account_unlinked` event says how many rows went.
Measured on 2026-10-05 against PostgreSQL, outside the suite, with two Google
rows on one user: one call removed both and left another user's Google row
alone, the event said two, and a second call answered `not_linked` and
recorded nothing; the unit test of the route shows the same on a modelled
client. Up to version 2.4.0 the route removed one row per call and cleared the
flag at the first (measured the same way with the route as it was: after one
call a Google `Account` row was left, while the flag said there was none).

A row that is written after that `DELETE` stays. Measured on 2026-10-05 at the
adapter and the unlink route against PostgreSQL, outside the suite: a link
that had spent its grant was held back before its `INSERT` by a second client,
a second grant was written and its link made, the unlink answered 200 and
removed that row, and the first link then wrote its own. The user had a Google
`Account` row while the flag said there was none; `/api/account/info`, which
the account page asks, reads the `Account` rows and answered that Google was
linked, and a further unlink removed the row. Outside a test this takes three
password checks that overlap (two link steps and the unlink), so it is no way
round the gate either.

The window is fixed, and it follows the application's clock. The grant is
spent before the `Account` row is written: if that write fails, the password
step has to be repeated. Someone who needs more than 5 minutes at Google is
refused after doing everything right (the 5 minutes are a design constant; no
consent step was timed). The grant is stamped and compared with the clock of
the application server, so a difference between the clocks of two instances
shifts the window by that much.

#### The refusal page depends on request context

An adapter cannot give Auth.js an error code of its own: Auth.js wraps every
adapter error and redirects to the error page with `error=Configuration`. So
the gate notes the refusal for the request it runs in (`AsyncLocalStorage`),
and a wrapper around the route handlers of Auth.js replaces that redirect
(`src/lib/auth/link-refusal.ts`). The wrapper is unit-tested; that the note
reaches it through Auth.js was read in the source, not measured. If it does
not, the link is refused all the same, and the visitor reads "Configuration
Error" on the English page. Each refusal makes Auth.js log an `AdapterError`
at error level, twice, with a stack trace (read in the source, not measured).
The refusal page keeps the heading "Sign-In Error".

#### The gate's two events carry no IP address and no `User-Agent`

Auth.js hands an adapter no request, so the gate has neither to record. A
session holder can cause `account_link_refused` rows without a throttle, each
at the price of one round trip to Google. Such a row is stored as a failure:
it counts as an error in the error rate of `GET /api/admin/metrics` (the
events of the last hour) and toward its `highErrorRate` alert, and refused
links push other events out of the lists of recent events (the last 10 of that
endpoint, the last 5 of the admin page). Whoever holds an `ADMIN` session sees
in those lists that a link was started (`account_link_initiated`): on the
admin page with the user's e-mail address, in the endpoint without the user
(the page and the endpoint were read in the code, not measured). A refused
attempt has still passed the `signIn` callback, which updates `lastLoginAt`
and the two account flags of the user whose e-mail is the Google address, if
there is one (as before).

#### The gate depends on how Auth.js writes accounts

That Auth.js writes `Account` rows through `adapter.linkAccount` only, and
creates a user right before it links it, was read in `@auth/core` 0.41.3 (and
that call is measured, see "Linking Google needs the password" above). A later
version that writes accounts another way would pass the gate by; one that
creates users another way would block first Google sign-ins.

#### A link shows no notice and ends no other session

Both were left as they are. A session that ends during the Google step makes
Auth.js create a new user for a Google address it does not know (measured with
a signed-out session).

### Rate limiting, lockout and enumeration

#### In-memory rate limiting is per-process and best-effort

Counters are not shared across instances (serverless / horizontally scaled
deployments multiply the limits) and reset on restart; under `next dev` they
can also reset when routes are recompiled. The store is an LRU of 20 000 keys,
so a flood of distinct keys can evict existing counters. The IP key comes from
headers the client controls unless a trusted proxy **overwrites**
`X-Forwarded-For`. Back the limiter with a shared store (Redis / Upstash) in
production. The database lockout does not have these limits.

#### Lockout can be used against a victim

Anyone who knows an e-mail address can lock that account's password sign-in
for `ACCOUNT_LOCKOUT_DURATION` minutes by failing `MAX_LOGIN_ATTEMPTS`
sign-ins, again and again. There is no self-service unlock and **no
password-reset flow**.

#### Account enumeration

Registration answers "User already exists"; the verification-e-mail action
works by address; on a 2FA account a correct password is answered with the 2FA
step (`2fa_required`), which confirms the password. A failed sign-in on an
existing account also waits for the lockout counter writes, so response time
can reveal that the account exists.

What the cost of the hash does to the response time is the last item of
[Sign-in: passwords, lockout and response time](#sign-in-passwords-lockout-and-response-time)
above.

### Stored data and cryptography

#### 2FA secret encryption

The encryption uses CryptoJS AES-256-CBC with the key derived from
`ENCRYPTION_KEY` as a passphrase (OpenSSL `EVP_BytesToKey`, MD5, one
iteration) and **no MAC**. During enrollment the encrypted pending secret is
sent to the browser and the ciphertext it returns is decrypted and stored —
keep the pending secret on the server instead before production. There is no
key rotation: after changing `ENCRYPTION_KEY`, users with 2FA can no longer
sign in with e-mail + password until an operator clears `twoFactorEnabled`,
`twoFactorSecret` and `backupCodes`; then they can enroll again. The new
key reads most of the old values as the empty text (measured with the
application's encryption, outside the suite: 1754 of 2000 secrets and 1882
of 2000 backup codes; the others cannot be read at all or give a few bytes
of something else). Nothing is accepted against a stored value that is no
whole secret (base32, sixteen characters or more) or no whole backup code
(eight letters and digits): not the six digits that `otplib` computes for
the empty secret, which anyone can compute, not "-" as a backup code, and
not the user's own codes. Measured with values written by another key: by
unit tests of `validateTOTPCode`, `validateBackupCode` and `authorize()`,
and in a browser against the real server and database
(`e2e/tests/two-factor-key-change.e2e.ts`), where each of the three
attempts is answered as a wrong code and counted as one. For production
prefer **AES-256-GCM** with a managed key (KMS).

#### Google's tokens in rows of earlier versions

**Rows written by versions up to 2.5.0 keep what those versions stored**,
every value Auth.js handed over, in plain text (measured on 2026-10-06 with
the code of 2.5.0: the same tests found all seven values in the rows), until
an operator clears them; `docs/DEPLOYMENT.md` gives the statement. The Google
provider is still configured with `access_type: "offline"` and
`prompt: "consent"`, so Google is still asked for a refresh token that the
application no longer keeps: the two parameters were left as they are, because
a Google sign-in without them cannot be measured here.

What the application stores now, and the tests behind "the same tests", is
under
[For a Google account the application stores which user it belongs to, and none of Google's tokens](#for-a-google-account-the-application-stores-which-user-it-belongs-to-and-none-of-googles-tokens)
above.

#### What the security events do not record

**Not recorded** (console or in-memory only): sign-ins, failed sign-ins, the
Google account of a new user (a first Google sign-in), password changes,
adding a password, backup-code use, account deletion. An e-mail marked
verified by a Google sign-in is not recorded either: it only sets the date on
the user row. Security events are deleted together with the account
(`onDelete: Cascade`). What is recorded, and what a row holds of the request,
is under [Security events](#security-events) above.

#### Security events of earlier versions

Rows written by versions 2.0.0 to 2.4.0 hold the whole `User-Agent`; in their
link / unlink events the address is the raw `X-Forwarded-For` header (without
it the raw `X-Real-IP`), and a missing address or `User-Agent` is stored as
`unknown`; an `account_unlinked` row of those versions names one account in
its metadata (`providerAccountId` and `accountId`) and no number of rows,
where later rows hold `accountsRemoved`, `providerAccountIds` and `accountIds`
(read in the source of those versions).

Nothing writes an `account_linked` event any more. Rows of that type in an
existing database were written by the confirmation page
`/link-account/confirm/[token]` of versions up to 2.3.0 or by the server
action `initiateAccountLinking` of versions up to 2.2.0. Neither shows that a
Google account was linked: the page set a flag on the user row
(`hasGoogleAccount` or `hasEmailAccount`), the action recorded that a link
request was made, and neither created an `Account` row (read in the source of
2.0.0 to 2.3.0). The name was not taken up again for that reason:
`account_link_completed` is written only after an `Account` row was created.

### Platform and operations

#### The Content-Security-Policy uses `script-src 'unsafe-inline'`

It is a static header applied to every response, including statically
prerendered pages, so it cannot carry per-request nonces; Next.js emits inline
hydration scripts. The structural directives (`object-src 'none'`,
`base-uri 'self'`, `frame-ancestors 'none'`, `form-action 'self'`) still hold.
A nonce-based `script-src` requires dynamic rendering.

#### E-mail is simulated whenever `RESEND_API_KEY` is unset

This holds **in every environment, production included**, and the e-mail is
reported as sent. Set a real key, an `EMAIL_FROM` on a domain verified in
Resend (the default `EMAIL_FROM` will be rejected) and `NEXTAUTH_URL` (e-mail
links are built from it) before going live.

#### Public health endpoint

`/api/health` reports status, uptime, memory usage, `NODE_ENV` and the package
version (database errors are logged, not returned).

#### `next-auth` v5 is a beta

It is pinned to `5.0.0-beta.32`; keep it pinned and review its changelog
before upgrading. The link gate relies on what its `@auth/core` 0.41.3 does in
`lib/actions/callback/handle-login.js` and `lib/init.js`: after an upgrade
`src/test/unit/__tests__/authjs-source-pin.test.ts` fails until the files it
names were read again and their new hashes recorded.

#### No migration files

The starter uses `prisma db push`; baseline your own migrations for
production.
