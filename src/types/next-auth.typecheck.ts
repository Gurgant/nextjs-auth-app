/**
 * Compile-time test, run by `pnpm typecheck`: the callback and event
 * parameter types exported by `@/types/next-auth` must not be `any`.
 *
 * That file is a `.d.ts` and `skipLibCheck` is on, so a type name that cannot
 * be resolved there is no error: it silently behaves like `any` and the
 * handlers annotated with these types are no longer checked. Each line below
 * fails to compile (TS2344) when that happens. Nothing here exists at runtime.
 */
import type {
  JWTCallbackParams,
  SessionCallbackParams,
  SignInEventMessage,
} from "@/types/next-auth";

// `keyof` of `any` is `string | number | symbol`, also when the `any` comes
// from an unresolved name; none of the types checked here has symbol keys.
// The usual `0 extends 1 & T` test does not see an unresolved name (measured
// with TypeScript 5.9.2), so it is not used.
type IsAny<T> = symbol extends keyof T ? true : false;
type NotAny<T extends false> = T;

export type JwtToken = NotAny<IsAny<JWTCallbackParams["token"]>>;
export type JwtUser = NotAny<IsAny<NonNullable<JWTCallbackParams["user"]>>>;
export type JwtAccount = NotAny<
  IsAny<NonNullable<JWTCallbackParams["account"]>>
>;
export type SessionSession = NotAny<IsAny<SessionCallbackParams["session"]>>;
export type SessionToken = NotAny<IsAny<SessionCallbackParams["token"]>>;
export type SignInUser = NotAny<IsAny<SignInEventMessage["user"]>>;
