/**
 * @jest-environment node
 */

/**
 * /api/account/info serves security state (2FA, linked providers): it must
 * never be cached, and a database failure must be reported as a failure —
 * not answered with made-up defaults that show a 2FA account as unprotected.
 */

jest.mock("next/server", () => jest.requireActual("next/server"));
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/data-access/user-repository", () => ({
  getUserWithAccountDetails: jest.fn(),
}));

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getUserWithAccountDetails } from "@/lib/data-access/user-repository";
import { GET } from "../route";

const mockAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;
const mockGetUser = getUserWithAccountDetails as unknown as jest.Mock;
const request = () => new NextRequest("http://localhost:3000/api/account/info");

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockAuth.mockResolvedValue({ user: { id: "u1" } });
});

afterEach(() => jest.restoreAllMocks());

it("returns 401 without a session", async () => {
  mockAuth.mockResolvedValue(null);
  const res = await GET(request());
  expect(res.status).toBe(401);
});

it("returns the real 2FA state, never cacheable", async () => {
  mockGetUser.mockResolvedValue({
    accounts: [],
    password: "hash",
    emailVerified: new Date(),
    twoFactorEnabled: true,
    createdAt: new Date("2025-07-30T00:00:00Z"),
    passwordSetAt: null,
    backupCodes: ["a", "b"],
  });

  const res = await GET(request());

  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(body.data.twoFactorEnabled).toBe(true);
  expect(body.data.backupCodesCount).toBe(2);
});

const userRow = (lastLoginMethod: string | null) => ({
  accounts: [{ provider: "google" }],
  password: "hash",
  emailVerified: new Date(),
  twoFactorEnabled: false,
  createdAt: new Date("2025-07-30T00:00:00Z"),
  passwordSetAt: null,
  backupCodes: [],
  lastLoginMethod,
});

it.each(["credentials", "google"])(
  "returns the stored last sign-in method (%s)",
  async (method) => {
    mockGetUser.mockResolvedValue(userRow(method));

    const body = await (await GET(request())).json();

    expect(body.data.lastLoginMethod).toBe(method);
    expect(body.data).not.toHaveProperty("primaryAuthMethod");
  },
);

it.each([
  ["nothing is stored", null],
  ["the stored value is not a known method", "email"],
])("returns a null last sign-in method when %s", async (_label, stored) => {
  mockGetUser.mockResolvedValue(userRow(stored));

  const body = await (await GET(request())).json();

  expect(body.data.lastLoginMethod).toBeNull();
});

it("reports a database failure instead of inventing account data", async () => {
  mockGetUser.mockRejectedValue(new Error("connection refused"));

  const res = await GET(request());

  expect(res.status).toBe(503);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(body.data).toBeUndefined();
});

// The route does not know the language of the page that asks. Each failure
// carries a `code`, and the page says it in its own language
// (src/hooks/use-account-data.ts); the English `message` is for other clients.
describe("each failure names itself with a code", () => {
  it("no session: unauthorized", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      success: false,
      code: "unauthorized",
      message: "Unauthorized",
    });
  });

  it("no user row for the session: userNotFound", async () => {
    mockGetUser.mockResolvedValue(null);

    const res = await GET(request());

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      success: false,
      code: "userNotFound",
      message: "User not found",
    });
  });

  it("a database failure: accountInfoUnavailable", async () => {
    mockGetUser.mockRejectedValue(new Error("connection refused"));

    const res = await GET(request());

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      success: false,
      code: "accountInfoUnavailable",
      message: "Account information is temporarily unavailable",
    });
  });

  it("any other failure: failedToLoadAccountInfo", async () => {
    mockAuth.mockRejectedValue(new Error("session check failed"));

    const res = await GET(request());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false,
      code: "failedToLoadAccountInfo",
      message: "Failed to load account information",
    });
  });
});
