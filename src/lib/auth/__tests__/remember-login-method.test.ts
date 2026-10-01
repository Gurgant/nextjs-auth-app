/**
 * @jest-environment node
 */

/**
 * After a successful sign-in the method is stored on the user row and in a
 * cookie. Neither write may make the sign-in fail.
 */

const mockCookieSet = jest.fn();
const mockCookies = jest.fn();
const mockUpdate = jest.fn();

jest.mock("next/headers", () => ({ cookies: () => mockCookies() }));
jest.mock("@/lib/repositories", () => ({
  repositories: { getUserRepository: () => ({ update: mockUpdate }) },
}));

import { rememberLoginMethod } from "../remember-login-method";
import {
  LAST_LOGIN_METHOD_COOKIE,
  LAST_LOGIN_METHOD_MAX_AGE,
} from "../last-login-method";

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockCookies.mockResolvedValue({ set: mockCookieSet });
  mockUpdate.mockResolvedValue({});
});

afterEach(() => jest.restoreAllMocks());

it("stores the method on the user and in a readable one-year cookie", async () => {
  await rememberLoginMethod("u1", "google");

  expect(mockUpdate).toHaveBeenCalledWith("u1", { lastLoginMethod: "google" });
  expect(mockCookieSet).toHaveBeenCalledWith(
    LAST_LOGIN_METHOD_COOKIE,
    "google",
    {
      path: "/",
      maxAge: LAST_LOGIN_METHOD_MAX_AGE,
      sameSite: "lax",
      secure: false,
      httpOnly: false,
    },
  );
});

it("marks the cookie Secure in production", async () => {
  jest.replaceProperty(process.env, "NODE_ENV", "production");

  await rememberLoginMethod("u1", "credentials");

  expect(mockCookieSet.mock.calls[0][2]).toMatchObject({ secure: true });
});

it("without a user id writes only the cookie", async () => {
  await rememberLoginMethod(undefined, "credentials");

  expect(mockUpdate).not.toHaveBeenCalled();
  expect(mockCookieSet).toHaveBeenCalledTimes(1);
});

it("a database failure does not throw and the cookie is still set", async () => {
  mockUpdate.mockRejectedValue(new Error("connection refused"));

  await expect(
    rememberLoginMethod("u1", "credentials"),
  ).resolves.toBeUndefined();

  expect(mockCookieSet).toHaveBeenCalledTimes(1);
  expect(console.error).toHaveBeenCalled();
});

it("a cookie failure does not throw and the database is still written", async () => {
  mockCookies.mockRejectedValue(new Error("outside a request scope"));

  await expect(rememberLoginMethod("u1", "google")).resolves.toBeUndefined();

  expect(mockUpdate).toHaveBeenCalledTimes(1);
  expect(console.error).toHaveBeenCalled();
});
