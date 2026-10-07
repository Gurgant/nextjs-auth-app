# Contributing

Thanks for taking an interest. This is a personal study project, maintained on
a best-effort basis — small, focused contributions are welcome, but reviews may
take a while.

## Getting started

Follow the Quick Start in the README (clone → `pnpm install` → `.env` →
`pnpm docker:up` → `pnpm db:setup && pnpm db:seed` → `pnpm dev`). If that path
breaks for you, that itself is a bug worth reporting.

## Before you open a PR

1. **Talk first for anything non-trivial** — open an issue describing the
   problem so we can agree on direction before you invest time.
2. Keep PRs small and single-purpose.
3. Make the checks pass locally:

   ```bash
   pnpm db:push:test # once: schema on the test DB (:5433)
   pnpm check        # eslint + tsc --noEmit
   pnpm test         # Jest suite (needs the test DB; pnpm test:unit does not)
   pnpm test:e2e     # Playwright suite, always against the test DB
   ```

4. The pre-commit hook runs Prettier, the translation validator, typecheck and
   lint — don't bypass it.
5. CI runs typecheck, lint, the translation validator, Jest, the build and
   the Playwright suite on every pull request. Playwright retries are off and
   the E2E helpers retry no request: if a test fails only sometimes, fix the
   test or the code instead of re-running until it passes.

## Conventions

- TypeScript strict; no `any` (the linter rejects it outside test files).
- Server actions validate input with Zod (in the action or its command) and
  derive identity from `auth()`, never from client-supplied ids.
- Client Components import role helpers from `@/lib/auth/roles`, never from
  server modules (`@/lib/auth`, `@/lib/auth/rbac`, `@/lib/security`, …). CI
  fails if the client chunks contain one of three server-only markers, but it
  cannot detect every server module — keep those imports out yourself.
- Tests must be able to fail: no `expect(true)`, no swallowed errors, no
  assertions hidden behind `if (count > 0)` (see `docs/TESTING.md`).
- No dead code: `pnpm test:unit` fails when a module under `src/` is reached
  by no entry point and no test, when a module outside `src/test` is reached
  only by tests, or when a name exported outside `src/app` and `src/test` is
  mentioned nowhere but in its definition. Delete it, or add it to the
  allow-list in `src/test/unit/__tests__/dead-code.test.ts` with the reason.
  The header of that file lists what the check does not see.
- No link without a page: `pnpm test:unit` fails when an internal link
  target that a file under `src/app` or `src/components` writes as a literal
  (an `href`, a `callbackUrl` or a `redirectTo`, as a JSX attribute or an
  object property; the first argument of `push()`, `replace()` or
  `prefetch()` on a name that the file binds to `useRouter()`; the first
  argument of `redirect()` or `permanentRedirect()`) is served by no page
  and no route handler under `src/app`. Remove the link or add the page. The
  check also reports a link that something else serves, such as a path
  without a locale (the middleware redirects it) or a static file: write
  the locale, or add the link with its reason to `ALLOWED_DEAD_LINKS` in
  `src/test/unit/__tests__/link-targets.test.ts`. The header of that file
  lists what the check does not see, such as a target built at run time.
- If you touch UI strings, update **all five** locale files in `messages/`
  (`pnpm validate-translations` enforces key parity) and write each text by
  the conventions of its language (below). `pnpm test:unit` fails
  when a key of `messages/en.json` is read by no application file under
  `src/` (tests do not count), or when a message file writes a key twice:
  delete the key from the five files, or add it to the allow-list in
  `src/test/unit/__tests__/message-keys.test.ts` with the place that reads
  it. The header of that file lists the forms that the check takes for a
  read; a key that the code reads in another way (through a template, a
  namespace in a variable, a translator handed to another file) is reported
  as unread and goes into the allow-list.
- Security-sensitive changes (auth flows, headers, crypto, rate limiting)
  should explain their reasoning in the PR description and update
  `SECURITY.md`, and its full text in `docs/SECURITY-DETAILS.md`, when they
  change the posture.

## Conventions of each language

After v2.5.2 an editor for each language read every text of `messages/` and
of the verification e-mail (`src/lib/email.ts`). What they settled is below.

Two unit tests read the texts, and neither is a proof-reader:

- `src/test/unit/__tests__/rich-messages.real-formatter.test.ts` fails when a
  translation has other arguments (`{name}`) or tags (`<terms>`) than the
  English text of its key, or when the installed next-intl cannot format a
  text.
- `src/test/unit/__tests__/message-conventions.test.ts` searches for the
  wordings that the editors removed, each in the shape v2.5.2 had it in
  ("Per favore", "Por favor", a French "?" without its no-break space, a
  German participle in title case, "contact support"). It is a list of
  narrow searches: a text can break a convention below and pass, so a new
  text still needs a reader of that language. If it ever stops a text that
  is right, narrow the search and add the text to its `allowed` list; do not
  reword the text.

In every language: placeholders and tags stay as they are, and no ASCII
apostrophe stands right before `<` or `{`. No text sends the reader to a
support team, because the kit has none: it names the administrator of the
site. One thing has one name. A translation says what the English text says
in its own words, not word for word.

- **English** — Title Case for buttons, headings and field labels ("Go to
  Dashboard", "Email Address"); sentence case for sentences, hints, status
  lines and error lines. The sign-in controls keep the capitals of Google's
  own "Sign in with Google". "sign in" is the verb and "sign-in" the noun;
  no "log in" or "login". "set up" is the verb and "setup" the noun.
  "two-factor authentication" in headings and sentences, "2FA" on buttons
  and in short lines. What the authenticator app is given is the "secret";
  what it shows, and a backup code, is a "code". "email", except in the two
  lines under the title of the home page.
- **Italian** — informal "tu". Sentence case: a capital on the first word
  and on proper names only (the names of the two legal documents keep
  theirs), and lower case after a colon. No "Per favore" and no "Si prega
  di": "Riprova." "Failed to X" is "Impossibile + infinitive", "X failed" is
  "non riuscita/o". "attivare / disattivare", not "abilitare"; "la 2FA" is
  feminine and has its article in a sentence. "segreto" for the 2FA secret,
  "codice di verifica" for the six digits, "codici di backup". "email",
  never "e-mail". A button named in a sentence stands in «…» and repeats its
  label.
- **Spanish** — informal "tú". Sentence case; after a colon that follows a
  label, a capital ("Importante: Guarda …"). "correo electrónico" for the
  address and for the sign-in method, never "email"; "correo de
  verificación" for the message; apart from that, the short "correo" stands
  only on the two sign-in buttons. "panel de control"; "activar /
  desactivar"; "la 2FA"; "clave" for the 2FA secret, "código de
  verificación" for the six digits, "códigos de respaldo". No "Por favor";
  "Failed to X" is "No se pudo …", "try again" is "Inténtalo de nuevo.",
  "successfully" is "correctamente"; "Escribe", not "Ingresa"; "no válido",
  "obligatoria". A button named in a sentence stands in «…» and repeats its
  label.
- **French** — "vous". Sentence case, and lower case after a colon. A
  no-break space before `?`, `!`, `:` and `;` and inside « », written in the
  files as the escape `\u00a0`, so that a diff shows it. "Failed to X" is
  "Impossible de + infinitive", "X failed" is "X a échoué"; "Veuillez +
  infinitive" for a request; no "avec succès". "email", "par email et mot de
  passe", "la 2FA", "secret" for the 2FA secret, "code de vérification" for
  the six digits, "codes de secours", "jeton", "terminer" for a set-up that
  is finished, "lier / délier". A button named in a sentence stands in
  « … » and repeats its label.
- **German** — formal "Sie". Only nouns have a capital, in headings and on
  buttons too ("Konto löschen"). An error line is a whole sentence with its
  article ("Das Konto konnte nicht gelöscht werden."); a success line stays
  short ("Konto erfolgreich gelöscht"). "Konto", "anmelden / Anmeldung",
  "Passwort", "E-Mail" with its hyphen, "verifizieren", "aktivieren /
  deaktivieren", "die 2FA", "Schlüssel" for the 2FA secret; compounds of
  German nouns in one word ("Kontoverknüpfung"). A button named in a
  sentence stands in „…“ and repeats its label.

## Reporting security issues

**Do not open a public issue.** Use GitHub's private vulnerability reporting —
see `SECURITY.md`.
