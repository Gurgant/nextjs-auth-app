/**
 * Warm-up of the dev server for the E2E suite.
 *
 * `next dev` compiles a route the first time it is requested. The global setup
 * requests every route the suite visits before the first test, so that no test
 * pays that compile inside one of its own waits.
 *
 * WARM_UP_ROUTES is the only list of those routes. It cannot go stale
 * silently: e2e/support/compile-guard.ts fails the run when the dev server
 * compiles a route while tests are running.
 *
 * No import on purpose: the Jest unit tests load this file as it is.
 */

export interface WarmUpRoute {
  /** The path the global setup requests. */
  readonly path: string;
  /** The entry `next dev` compiles for it, as in "Compiled <entry> in ...". */
  readonly entry: string;
  /**
   * Set for the entry of the not-found page: `path` is then a path that no
   * page serves, and the answer has to be 404.
   */
  readonly notFound?: true;
}

/**
 * One request per dev-server entry the suite visits. One locale is enough:
 * the locale is a parameter of the same entry. `/instrumentation`,
 * `/middleware` and `/[locale]` are already compiled when the global setup
 * starts (Playwright's availability check requests `/`); `/en` is listed so
 * that the list is complete on its own. The link route exports POST only and
 * answers the GET with 405. The verification page is requested with a token
 * that no row can have (a real one has no hyphen) and answers 200 with its
 * failure text. The last entry is the page `next dev` serves for a path that
 * has no page: the suite opens one, the URL of a page that was removed.
 */
export const WARM_UP_ROUTES: readonly WarmUpRoute[] = [
  { path: "/en", entry: "/[locale]" },
  { path: "/api/auth/providers", entry: "/api/auth/[...nextauth]" },
  { path: "/en/register", entry: "/[locale]/register" },
  { path: "/en/account", entry: "/[locale]/account" },
  { path: "/api/account/info", entry: "/api/account/info" },
  { path: "/en/dashboard", entry: "/[locale]/dashboard" },
  { path: "/en/auth/signin", entry: "/[locale]/auth/signin" },
  { path: "/en/dashboard/user", entry: "/[locale]/dashboard/user" },
  { path: "/en/admin", entry: "/[locale]/admin" },
  { path: "/en/dashboard/pro", entry: "/[locale]/dashboard/pro" },
  {
    path: "/api/auth/link-account/initiate",
    entry: "/api/auth/link-account/initiate",
  },
  { path: "/en/auth/error", entry: "/[locale]/auth/error" },
  {
    path: "/en/verify-email/no-such-token",
    entry: "/[locale]/verify-email/[token]",
  },
  { path: "/en/terms", entry: "/[locale]/terms" },
  { path: "/en/privacy", entry: "/[locale]/privacy" },
  { path: "/en/no-such-page", entry: "/_not-found", notFound: true },
];

/** Upper limit for one request (a cold compile on a busy machine). */
export const WARM_UP_REQUEST_TIMEOUT_MS = 60_000;
/** Upper limit for the whole warm-up, both passes. */
export const WARM_UP_TOTAL_TIMEOUT_MS = 300_000;

/**
 * Sends one GET without a session and without following redirects. Resolves
 * with the HTTP status; rejects on a transport error or when `timeoutMs` is
 * over.
 */
export type WarmUpGet = (path: string, timeoutMs: number) => Promise<number>;

export interface WarmUpOptions {
  get: WarmUpGet;
  log: (line: string) => void;
  now?: () => number;
  routes?: readonly WarmUpRoute[];
}

/**
 * `compile`: the first request of each route makes `next dev` compile it.
 * `check`: the same requests again. They show in the log that every route now
 * answers without compiling, and they request again an entry that `next dev`
 * dropped as inactive while a slow first pass was still compiling others.
 */
const PASSES = ["compile", "check"] as const;

/**
 * Requests every route once per pass, one after the other. This is a bounded
 * wait, not a retry: no request is repeated within a pass, and the first
 * request that fails, times out, or answers 404 or 5xx ends the warm-up with
 * an error (which fails the global setup, before any test runs).
 *
 * Any other status counts as answered. Without a session the pages behind a
 * sign-in answer 307 and /api/account/info answers 401; the route's own code
 * gives that answer, so the route is compiled.
 *
 * The entry of the not-found page is the other way round: 404 is its answer,
 * and any other status ends the warm-up, because a page serves that path and
 * the not-found page was not compiled.
 */
export async function warmUp(options: WarmUpOptions): Promise<void> {
  const { get, log } = options;
  const now = options.now ?? Date.now;
  const routes = options.routes ?? WARM_UP_ROUTES;
  const startedAt = now();

  for (const pass of PASSES) {
    for (const route of routes) {
      const timeLeft = WARM_UP_TOTAL_TIMEOUT_MS - (now() - startedAt);
      if (timeLeft <= 0) {
        throw new Error(
          `E2E warm-up did not finish within ${WARM_UP_TOTAL_TIMEOUT_MS / 1000} s: ` +
            `stopped before GET ${route.path} (${pass} pass). ` +
            "The dev server is too slow to compile the routes of the suite; " +
            "see the [WebServer] lines above.",
        );
      }

      const requestedAt = now();
      let status: number;
      try {
        status = await get(
          route.path,
          Math.min(WARM_UP_REQUEST_TIMEOUT_MS, timeLeft),
        );
      } catch (error) {
        const elapsed = now() - requestedAt;
        const reason = error instanceof Error ? error.message : String(error);
        log(
          `warm-up ${pass}: GET ${route.path} failed after ${elapsed} ms: ${reason}`,
        );
        throw new Error(
          `E2E warm-up: GET ${route.path} (entry ${route.entry}) got no answer ` +
            `in the ${pass} pass, after ${elapsed} ms: ${reason}. ` +
            "The request is not repeated; see the [WebServer] lines above.",
        );
      }

      log(
        `warm-up ${pass}: GET ${route.path} -> ${status} in ${now() - requestedAt} ms`,
      );
      if (status === 404 && !route.notFound) {
        throw new Error(
          `E2E warm-up: GET ${route.path} answered 404 (${pass} pass). ` +
            `The entry ${route.entry} does not exist any more: WARM_UP_ROUTES ` +
            "in e2e/support/warm-up.ts is stale.",
        );
      }
      if (status >= 500) {
        throw new Error(
          `E2E warm-up: GET ${route.path} answered ${status} (${pass} pass). ` +
            `The entry ${route.entry} does not compile or crashes; ` +
            "see the [WebServer] lines above.",
        );
      }
      if (route.notFound && status !== 404) {
        throw new Error(
          `E2E warm-up: GET ${route.path} answered ${status} (${pass} pass), not 404. ` +
            `It is listed as a path that no page serves, to compile ${route.entry}: ` +
            "choose another path in WARM_UP_ROUTES in e2e/support/warm-up.ts.",
        );
      }
    }
  }

  log(
    `warm-up complete: ${routes.length} routes, ${PASSES.length} passes, ` +
      `${now() - startedAt} ms`,
  );
}
