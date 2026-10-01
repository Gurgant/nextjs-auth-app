/**
 * @jest-environment node
 */

/**
 * The Auth.js `signIn` event fires once per successful sign-in: that is where
 * the method is recorded. Unknown providers are not recorded.
 */

jest.mock("next-auth", () => {
  class CredentialsSignin extends Error {
    code = "credentials";
  }
  return { __esModule: true, CredentialsSignin };
});
jest.mock("next-auth/providers/credentials", () => ({
  __esModule: true,
  default: (options: unknown) => ({ id: "credentials", options }),
}));
jest.mock("next-auth/providers/google", () => ({
  __esModule: true,
  default: (options: unknown) => ({ id: "google", options }),
}));
jest.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/auth/remember-login-method", () => ({
  rememberLoginMethod: jest.fn(),
}));

import { authOptions } from "@/lib/auth-config";
import { rememberLoginMethod } from "@/lib/auth/remember-login-method";

const mockRemember = rememberLoginMethod as jest.Mock;
type SignInEvent = (message: {
  user: { id?: string };
  account?: { provider: string } | null;
}) => Promise<void>;
const signInEvent = authOptions.events?.signIn as unknown as SignInEvent;

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

it("records a Google sign-in", async () => {
  await signInEvent({ user: { id: "u1" }, account: { provider: "google" } });

  expect(mockRemember).toHaveBeenCalledWith("u1", "google");
});

it("records a credentials sign-in", async () => {
  await signInEvent({
    user: { id: "u2" },
    account: { provider: "credentials" },
  });

  expect(mockRemember).toHaveBeenCalledWith("u2", "credentials");
});

it("treats a sign-in without an account as credentials", async () => {
  await signInEvent({ user: { id: "u3" }, account: null });

  expect(mockRemember).toHaveBeenCalledWith("u3", "credentials");
});

it("does not record a provider the app does not know", async () => {
  await signInEvent({ user: { id: "u4" }, account: { provider: "github" } });

  expect(mockRemember).not.toHaveBeenCalled();
});
