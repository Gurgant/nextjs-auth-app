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
5. CI runs typecheck, lint, Jest, the build and the Playwright suite on every
   pull request. Playwright retries are off and the E2E helpers retry no
   request: if a test fails only sometimes, fix the test or the code instead
   of re-running until it passes.

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
- If you touch UI strings, update **all five** locale files in `messages/`
  (`pnpm validate-translations` enforces key parity).
- Security-sensitive changes (auth flows, headers, crypto, rate limiting)
  should explain their reasoning in the PR description and update
  `SECURITY.md` when they change the posture.

## Reporting security issues

**Do not open a public issue.** Use GitHub's private vulnerability reporting —
see `SECURITY.md`.
