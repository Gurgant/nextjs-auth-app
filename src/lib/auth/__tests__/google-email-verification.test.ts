/**
 * @jest-environment node
 */

/**
 * Google vouches for an address only with `email_verified: true` (the
 * boolean) in its ID token, and only for the address that token names. When it
 * does, the first verification date is stored once and never moved; a storage
 * failure must not make the sign-in fail.
 */

const mockUpdate = jest.fn();

jest.mock("@/lib/repositories", () => ({
  repositories: { getUserRepository: () => ({ update: mockUpdate }) },
}));

import {
  googleSaysEmailVerified,
  resolveEmailVerified,
} from "../google-email-verification";

const VERIFIED_BEFORE = new Date("2025-03-04T05:06:07.000Z");
const google = { provider: "google" };
const unverifiedUser = {
  id: "u1",
  email: "a@example.com",
  emailVerified: null,
};
const claims = { sub: "g1", email: "a@example.com", email_verified: true };

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockUpdate.mockResolvedValue({});
});

afterEach(() => jest.restoreAllMocks());

describe("googleSaysEmailVerified", () => {
  it.each([
    ["the claim is true for the stored address", claims],
    ["the address differs only in case", { ...claims, email: "A@Example.COM" }],
  ])("is true when %s", (_label, profile) => {
    expect(
      googleSaysEmailVerified({
        user: unverifiedUser,
        account: google,
        profile,
      }),
    ).toBe(true);
  });

  it.each([
    ["another provider", { provider: "credentials" }],
    ["no account", null],
    ["an undefined account", undefined],
  ])("is false for %s, whatever the profile says", (_label, account) => {
    expect(
      googleSaysEmailVerified({
        user: unverifiedUser,
        account,
        profile: claims,
      }),
    ).toBe(false);
  });

  it.each([
    ["an undefined profile", undefined],
    ["a null profile", null],
    ["a profile that is a string", "email_verified"],
    ["email_verified false", { ...claims, email_verified: false }],
    ["email_verified null", { ...claims, email_verified: null }],
    ["email_verified 1", { ...claims, email_verified: 1 }],
    ['email_verified "true"', { ...claims, email_verified: "true" }],
    ["no email_verified claim", { sub: "g1", email: "a@example.com" }],
    ["no email claim", { sub: "g1", email_verified: true }],
    ["an email claim that is not a string", { ...claims, email: null }],
    ["another address", { ...claims, email: "b@example.com" }],
  ])("is false for %s", (_label, profile) => {
    expect(
      googleSaysEmailVerified({
        user: unverifiedUser,
        account: google,
        profile,
      }),
    ).toBe(false);
  });

  it.each([
    ["no stored address", { id: "u1" }],
    ["a null stored address", { id: "u1", email: null }],
  ])("is false for a user with %s", (_label, user) => {
    expect(
      googleSaysEmailVerified({ user, account: google, profile: claims }),
    ).toBe(false);
  });
});

describe("resolveEmailVerified", () => {
  it("stores the date once and returns that same date", async () => {
    const verifiedAt = await resolveEmailVerified({
      user: unverifiedUser,
      account: google,
      profile: claims,
    });

    expect(verifiedAt).toBeInstanceOf(Date);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith("u1", {
      emailVerified: verifiedAt,
    });
  });

  it("keeps the date of a user who is already verified, without writing", async () => {
    await expect(
      resolveEmailVerified({
        user: { ...unverifiedUser, emailVerified: VERIFIED_BEFORE },
        account: google,
        profile: claims,
      }),
    ).resolves.toBe(VERIFIED_BEFORE);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns the previous value without writing when Google does not vouch", async () => {
    await expect(
      resolveEmailVerified({
        user: unverifiedUser,
        account: google,
        profile: { ...claims, email_verified: false },
      }),
    ).resolves.toBeNull();

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns the previous value without writing when the user has no id", async () => {
    await expect(
      resolveEmailVerified({
        user: { email: "a@example.com" },
        account: google,
        profile: claims,
      }),
    ).resolves.toBeUndefined();

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("a database failure does not throw and leaves the user unverified", async () => {
    mockUpdate.mockRejectedValue(new Error("connection refused"));

    await expect(
      resolveEmailVerified({
        user: unverifiedUser,
        account: google,
        profile: claims,
      }),
    ).resolves.toBeNull();

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
