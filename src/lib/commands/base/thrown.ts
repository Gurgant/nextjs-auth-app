import { types } from "util";

/**
 * What the failed event of the bus and the line of the logging middleware say
 * about something a command threw. `throw` takes any value, not only an
 * Error: null and undefined have no `message` to read (reading it throws in
 * its turn), and any other value can hold anything, a text with the input in
 * it included. So a value that is not an Error is described there by its
 * kind, one of a fixed set of texts, and never by its content. Only an Error
 * gives its message and its stack: one of this realm, or a native one of
 * another realm, which `instanceof` does not see (under Jest, the Error of a
 * failed `fs` call is one).
 * The bus has a console line of its own (`enableLogging`, on in development)
 * that does not come through here: it prints what was caught as it is.
 */
export function describeThrown(thrown: unknown): {
  message: string;
  stack?: string;
} {
  // @types/node marks `types.isNativeError` as deprecated in favour of
  // `Error.isError`. package.json allows Node 20 and the CI runs Node 22:
  // before replacing it, see that both have `Error.isError`.
  if (thrown instanceof Error || types.isNativeError(thrown)) {
    return { message: thrown.message, stack: thrown.stack };
  }
  const kind = thrown === null ? "null" : typeof thrown;
  return { message: `Non-Error value thrown: ${kind}` };
}
