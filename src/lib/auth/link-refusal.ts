import { AsyncLocalStorage } from "node:async_hooks";
import type { NextRequest } from "next/server";

/**
 * Which page a refused account link ends on. Presentation only: whether an
 * account is linked is decided in ./link-gate.ts, and nothing here changes
 * that decision.
 *
 * An error thrown in an adapter cannot carry a code of its own to the
 * browser: Auth.js wraps every adapter error into AdapterError and answers
 * with a redirect to its error page and `error=Configuration` (read in
 * @auth/core 0.41.3: lib/init.js, index.js). So the gate notes the refusal
 * for the request it runs in, and the wrapper around the route handlers of
 * Auth.js replaces that redirect. If the note does not arrive, the link is
 * refused all the same and the visitor reads the configuration error.
 */

// No locale on purpose: the middleware adds the visitor's own (the
// NEXT_LOCALE cookie, then Accept-Language) and keeps the query string.
export const LINK_REFUSED_PATH = "/auth/error?error=LinkNotConfirmed";

const linkRequest = new AsyncLocalStorage<{ linkRefused: boolean }>();

/** Called by the link gate when it refuses. Outside a wrapped request it does nothing. */
export function noteLinkRefusal(): void {
  const store = linkRequest.getStore();
  if (store) store.linkRefused = true;
}

type RouteHandler = (request: NextRequest) => Promise<Response>;

/**
 * Wraps a route handler of Auth.js. When the link gate refused during the
 * request and the answer is a redirect, the browser is sent to the refusal
 * page on the origin of that redirect instead. Every other answer is
 * returned as the handler gave it.
 */
export function withLinkRefusalPage(handler: RouteHandler): RouteHandler {
  return async (request) => {
    const store = { linkRefused: false };
    const response = await linkRequest.run(store, () => handler(request));
    const location = response.headers.get("Location");
    if (!store.linkRefused || !location) return response;
    return Response.redirect(new URL(LINK_REFUSED_PATH, location), 302);
  };
}
