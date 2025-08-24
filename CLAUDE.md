# CLAUDE.md - Important Project Context

## Package Manager - CRITICAL

**ALWAYS USE pnpm, NEVER npm!**

- ✅ Use `pnpm` for all package management commands
- ✅ Use `pnpx` instead of `npx`
- ❌ NEVER use `npm` commands
- ❌ NEVER use `npx` commands

### Correct Commands:

- `pnpm install` (not npm install)
- `pnpm run dev` (not npm run dev)
- `pnpm run build` (not npm run build)
- `pnpm run start` (not npm run start)
- `pnpm run test` (not npm run test)
- `pnpm run lint` (not npm run lint)
- `pnpm run typecheck` (not npm run typecheck)
- `pnpx <command>` (not npx <command>)

## Project Structure

This is a Next.js authentication application with:

- TypeScript
- Next.js App Router
- NextAuth.js for authentication
- Internationalization (i18n) with next-intl
- Supported locales: en, es, fr, it, de

## Project Directory - CRITICAL

**Working Directory**: `/home/gurgant/CursorProjects/2/nextjs-auth-app/`
**NEVER work in**: `/home/gurgant/CursorProjects/2/` (parent directory)

## TODO List Management System

**CRITICAL INSTRUCTION**: Always save comprehensive todo lists to PROJECT_TODOS.md before compacting/summarizing conversations to prevent losing track of incomplete work.

## Current Work Context

**✅ COMPLETED PHASES:**

- Phase 16: Fix Linting Issues & Errors (100% complete - 0 ESLint errors)
- Phase 17: Achieve 100% Test Completion (100% complete - 287/287 tests passing)
- Phase 18: TypeScript Strict Compliance (100% complete - 0 TypeScript errors)
- Phase 19: CI/CD Pipeline Complete Success (100% complete - All pipelines passing)
- Phase 20: Production Deployment Resolution (100% complete - Production deployments working)

**🎉 MAJOR MILESTONE ACHIEVED: 100% CI/CD SUCCESS**

**✅ ALL CRITICAL SYSTEMS OPERATIONAL:**
- ✅ CI/CD Pipeline: 100% success rate
- ✅ E2E Tests: 87/87 passing
- ✅ Unit/Integration Tests: All passing  
- ✅ TypeScript Compilation: 0 errors
- ✅ ESLint Validation: 0 warnings
- ✅ Production Deployments: Working perfectly
- ✅ Release Creation: Automated & functional

**❌ REMAINING INCOMPLETE PHASE:**

- **Phase 4.2: Translation Files Implementation** (From original task.md plan - NON-CRITICAL)
  - Multiple language translation files still incomplete
  - German (de) and Italian (it) translations missing from many components
  - Server-side translation for remaining actions incomplete
  - Translation validation scripts not fully implemented

**⚡ PROJECT STATUS: PRODUCTION READY**

Previous work completed:

- Secure Locale Implementation
- Authentication system fixes
- Advanced testing strategy
- Form validation with i18n support

## Security Considerations

- Always validate locale inputs against whitelist
- Log security events for monitoring
- Use type-safe locale handling
- Never trust URL parsing without validation

## Git Policy

- NO git commits until explicitly requested by user
- User prefers to review all changes before committing

## Testing

- Run tests with: `pnpm run test`
- Lint with: `pnpm run lint`
- Type check with: `pnpm run typecheck`

## CRITICAL: Playwright E2E Process Management

**MANDATORY RULE: Always check for zombie processes before running E2E tests!**

### Problem: E2E tests hang/fail due to zombie dev processes

When Playwright E2E tests fail to start or hang indefinitely, it's usually because a previous `pnpm dev` or `next dev` process is still running and occupying port 3000.

### Solution: Always run process cleanup FIRST

```bash
# 1. Check for processes on development ports
netstat -tulnp 2>/dev/null | grep -E ":(3000|3001|3002|3003|3004|3005)" | head -10

# 2. Kill any zombie processes found
kill -9 <PID>

# 3. Then run the E2E test
pnpm exec playwright test --workers=1 -g "test name"
```

### Implementation Rule:

- **BEFORE any E2E test execution**: ALWAYS check and kill zombie processes
- **NEVER assume E2E tests are broken**: Check process conflicts first
- **Add timeout protection**: Use `timeout 60` command for all E2E test runs

## Important Files

- `/src/config/i18n.ts` - Centralized locale configuration
- `/src/hooks/use-safe-locale.ts` - Safe locale extraction hook
- `/src/utils/navigation.ts` - Type-safe navigation utilities
- `/middleware.ts` - Root middleware (currently active)
- `/src/middleware.ts` - Ignored by Next.js (duplicate middleware issue)
