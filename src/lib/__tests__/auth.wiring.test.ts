/**
 * @jest-environment node
 */

/**
 * src/lib/auth.ts is where the session guard is switched on: Auth.js gets the
 * app's options plus a `jwt.decode` that wraps its own decode. Without this
 * wiring every other test of the guard would pass while no token is checked.
 */

jest.mock("next-auth", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    auth: "auth",
    signIn: "signIn",
    signOut: "signOut",
    handlers: "handlers",
  })),
}));
jest.mock("next-auth/jwt", () => ({ decode: jest.fn() }));
jest.mock("@/lib/auth-config", () => ({ authOptions: { marker: true } }));
jest.mock("@/lib/auth/session-revocation", () => {
  const guardedDecode = jest.fn();
  return { createVerifiedDecode: jest.fn(() => guardedDecode) };
});

import NextAuth from "next-auth";
import { decode } from "next-auth/jwt";
import { createVerifiedDecode } from "@/lib/auth/session-revocation";
import * as authModule from "@/lib/auth";

const mockNextAuth = NextAuth as unknown as jest.Mock;
const mockCreateVerifiedDecode = createVerifiedDecode as jest.Mock;

it("passes Auth.js the app's options and the guarded decode", () => {
  expect(mockNextAuth).toHaveBeenCalledTimes(1);
  const config = mockNextAuth.mock.calls[0][0];
  expect(config).toHaveProperty("jwt");

  expect(mockCreateVerifiedDecode).toHaveBeenCalledTimes(1);
  expect(mockCreateVerifiedDecode).toHaveBeenCalledWith(decode);
  const guardedDecode = mockCreateVerifiedDecode.mock.results[0].value;
  expect(config).toEqual({ marker: true, jwt: { decode: guardedDecode } });
});

it("exports what NextAuth returns, and the options", () => {
  expect(authModule).toMatchObject({
    auth: "auth",
    signIn: "signIn",
    signOut: "signOut",
    handlers: "handlers",
    authOptions: { marker: true },
  });
});
