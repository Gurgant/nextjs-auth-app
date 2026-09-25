/**
 * Google sign-in is optional: the provider is registered only when both
 * GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set, so the UI (which asks
 * /api/auth/providers) never offers a Google button that cannot work.
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

const saved = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
};

function providerIds(google: { id?: string; secret?: string }): string[] {
  for (const [key, value] of [
    ["GOOGLE_CLIENT_ID", google.id],
    ["GOOGLE_CLIENT_SECRET", google.secret],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  let ids: string[] = [];
  jest.isolateModules(() => {
    const { authOptions } = require("@/lib/auth-config");
    ids = authOptions.providers.map((p: { id: string }) => p.id);
  });
  return ids;
}

afterAll(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

it("registers Google when both credentials are set", () => {
  expect(providerIds({ id: "client-id", secret: "client-secret" })).toEqual([
    "google",
    "credentials",
  ]);
});

it.each([
  ["neither", {}],
  ["only the id", { id: "client-id" }],
  ["only the secret", { secret: "client-secret" }],
])("offers credentials only when %s is set", (_label, google) => {
  expect(providerIds(google)).toEqual(["credentials"]);
});
