/**
 * Next.js instrumentation hook.
 *
 * `register()` runs once when a server instance starts and must complete before
 * requests are handled. Importing `./lib/env` runs that module's schema
 * validation, which throws on a misconfigured environment: Next then logs the
 * error and answers every request with an error (the process keeps running).
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
