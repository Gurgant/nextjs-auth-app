/**
 * @jest-environment node
 */

/**
 * The adapter the application hands to Auth.js is the link gate
 * (src/lib/auth/link-gate.ts) around the Prisma adapter, not the Prisma
 * adapter itself. Without this wiring every other test of the gate would
 * pass while Auth.js links whatever a signed-in user completes Google
 * sign-in with.
 *
 * next-auth and its providers are replaced with the stand-ins the other
 * auth-config tests use. The Prisma adapter is a stand-in with two methods,
 * and the Prisma client answers what the gate asks.
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
jest.mock("@auth/prisma-adapter", () => {
  const base = {
    linkAccount: jest.fn(async () => undefined),
    getUser: jest.fn(),
  };
  return { PrismaAdapter: jest.fn(() => base) };
});
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn(), updateMany: jest.fn() },
    securityEvent: { create: jest.fn() },
  },
}));
jest.mock("@/lib/repositories", () => ({
  repositories: { getUserRepository: jest.fn() },
}));
jest.mock("@/lib/auth/remember-login-method", () => ({
  rememberLoginMethod: jest.fn(),
}));
jest.mock("@/lib/auth/session-revocation", () => ({
  newSessionId: jest.fn(),
  readSessionVersion: jest.fn(),
  revokeSession: jest.fn(),
}));

import type { AdapterAccount } from "next-auth/adapters";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth-config";

const adapter = authOptions.adapter;
/** The object the stand-in for PrismaAdapter() returned to auth-config. */
const base: { linkAccount: jest.Mock; getUser: jest.Mock } = (
  PrismaAdapter as unknown as jest.Mock
).mock.results[0].value;
const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; updateMany: jest.Mock };
  securityEvent: { create: jest.Mock };
};

const googleAccount: AdapterAccount = {
  userId: "user-1",
  type: "oidc",
  provider: "google",
  providerAccountId: "google-subject-1",
};

it("built the adapter from the Prisma client, once", () => {
  expect(PrismaAdapter).toHaveBeenCalledTimes(1);
  expect(PrismaAdapter).toHaveBeenCalledWith(prisma);
});

it("refuses to link onto a user that has a password and no grant, and does not reach the Prisma adapter", async () => {
  mockPrisma.user.findUnique.mockResolvedValue({
    password: "a-bcrypt-hash",
    emailVerified: null,
    accounts: [{ provider: "credentials" }],
  });
  mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.securityEvent.create.mockResolvedValue({});

  await expect(adapter.linkAccount(googleAccount)).rejects.toMatchObject({
    name: "LinkNotConfirmedError",
    reason: "no_grant",
  });
  expect(base.linkAccount).not.toHaveBeenCalled();
});

it("hands Auth.js linkAccount as a key of its own and every other method as the Prisma adapter's", () => {
  // Auth.js wraps the adapter key by key (@auth/core lib/init.js).
  expect(Object.keys(adapter).sort()).toEqual(["getUser", "linkAccount"]);
  expect(adapter.getUser).toBe(base.getUser);
  expect(adapter.linkAccount).not.toBe(base.linkAccount);
});
