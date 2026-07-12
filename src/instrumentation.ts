/**
 * Next.js instrumentation hook.
 *
 * `register()` runs once when a server instance starts and must complete before
 * the server accepts requests — the ideal fail-fast point for environment
 * validation. Importing `./lib/env` runs that module's schema validation, which
 * throws on a misconfigured environment and aborts startup.
 *
 * Guarded to the Node.js runtime so it neither runs in the Edge bundle nor at
 * `next build` (Next does not execute `register()` during build); validation
 * therefore happens at server cold start — `next dev` and `next start`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/env");
  }
}
