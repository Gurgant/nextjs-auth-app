import { types } from "util";

/**
 * Whether something a command threw is an Error: one of this realm, or a
 * native one of another realm, which `instanceof` does not see (under Jest,
 * the Error of a failed `fs` call is one).
 */
export function isThrownError(thrown: unknown): thrown is Error {
  // @types/node marks `types.isNativeError` as deprecated in favour of
  // `Error.isError`. package.json allows Node 20 and the CI runs Node 22:
  // before replacing it, see that both have `Error.isError`.
  return thrown instanceof Error || types.isNativeError(thrown);
}

/**
 * What the bus and its middleware say about something a command threw: the
 * failed event, the line of the logging middleware, the console line of the
 * bus itself (`enableLogging`, on in development) and the entry of the audit
 * middleware. `throw` takes any value, not only an Error: null and undefined
 * have no `message` to read (reading it throws in its turn), and any other
 * value can hold anything, a text with the input in it included. So a value
 * that is not an Error is described by its kind, one of a fixed set of texts,
 * and never by its content. Only an Error gives its message and its stack.
 */
export function describeThrown(thrown: unknown): {
  message: string;
  stack?: string;
} {
  if (isThrownError(thrown)) {
    return { message: thrown.message, stack: thrown.stack };
  }
  const kind = thrown === null ? "null" : typeof thrown;
  return { message: `Non-Error value thrown: ${kind}` };
}
