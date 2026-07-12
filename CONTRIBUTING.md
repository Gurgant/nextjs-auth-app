# Contributing

Thanks for taking an interest. This project is a maintained auth starter —
small, focused contributions are very welcome.

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
   pnpm check        # eslint + tsc --noEmit
   pnpm test         # Jest suite
   pnpm test:e2e     # Playwright suite (needs the docker test DB)
   ```

4. The pre-commit hook runs Prettier, the translation validator, typecheck and
   lint — don't bypass it.

## Conventions

- TypeScript strict; no new `any` (the linter warns — don't add to the pile).
- Server actions validate input with Zod and derive identity from `auth()`,
  never from client-supplied ids.
- If you touch UI strings, update **all five** locale files in `messages/`
  (`pnpm validate-translations` enforces key parity).
- Security-sensitive changes (auth flows, headers, crypto, rate limiting)
  should explain their reasoning in the PR description and update
  `SECURITY.md` when they change the posture.

## Reporting security issues

**Do not open a public issue.** Use GitHub's private vulnerability reporting —
see `SECURITY.md`.
