/**
 * @jest-environment node
 *
 * addPasswordToGoogleUser hashes at the configured bcrypt cost
 * (BCRYPT_ROUNDS), like registration and password change.
 */
// Translations answer with the English fallback the action passes in.
jest.mock("@/lib/utils/server-translations", () => ({
  translateError: async (_locale: string, key: string, fallback?: string) =>
    fallback ?? key,
  translateSuccess: async (_locale: string, key: string, fallback?: string) =>
    fallback ?? key,
}));

jest.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

jest.mock("@/lib/auth", () => ({
  auth: async () => ({ user: { id: "user-123" } }),
}));

// The rate limiter has its own unit test: here it always allows.
jest.mock("@/lib/rate-limit", () => ({
  recordAttempt: () => ({
    blocked: false,
    remaining: 99,
    retryAfterSeconds: 0,
  }),
  RATE_LIMITS: {
    passwordVerify: { limit: 5, windowMs: 900000 },
    register: { limit: 5, windowMs: 3600000 },
  },
}));

jest.mock("@/lib/security", () => ({
  getClientIP: () => "127.0.0.1",
}));

jest.mock("@/lib/utils/form-locale-server", () => ({
  resolveFormLocale: async () => "en",
}));

const mockRepo = {
  findById: jest.fn(),
  findByEmailWithAccounts: jest.fn(),
  updatePassword: jest.fn(),
  update: jest.fn(),
};
jest.mock("@/lib/repositories", () => ({
  repositories: { getUserRepository: () => mockRepo },
}));

jest.mock("@/lib/events", () => ({
  eventBus: { publish: async () => {} },
}));

import bcrypt from "bcryptjs";
import { addPasswordToGoogleUser } from "../auth";

const PASSWORD = "NewPass456!";
const googleUser = {
  id: "user-123",
  email: "google.user@example.com",
  password: null,
};

describe("addPasswordToGoogleUser (PW-8)", () => {
  const previousRounds = process.env.BCRYPT_ROUNDS;

  beforeEach(() => {
    // 5 differs from the old literal (12) and from the Jest default (4).
    process.env.BCRYPT_ROUNDS = "5";
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});

    mockRepo.findById.mockResolvedValue(googleUser);
    mockRepo.findByEmailWithAccounts.mockResolvedValue({
      ...googleUser,
      accounts: [{ provider: "google" }],
    });
    mockRepo.updatePassword.mockResolvedValue(undefined);
    mockRepo.update.mockResolvedValue(googleUser);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (previousRounds === undefined) {
      delete process.env.BCRYPT_ROUNDS;
    } else {
      process.env.BCRYPT_ROUNDS = previousRounds;
    }
  });

  it("hashes the password at the configured cost", async () => {
    const formData = new FormData();
    formData.set("password", PASSWORD);
    formData.set("confirmPassword", PASSWORD);

    const result = await addPasswordToGoogleUser(formData);

    expect(result.success).toBe(true);
    expect(mockRepo.updatePassword).toHaveBeenCalledTimes(1);
    const [userId, hash] = mockRepo.updatePassword.mock.calls[0];
    expect(userId).toBe("user-123");
    expect(await bcrypt.compare(PASSWORD, hash)).toBe(true);
    expect(bcrypt.getRounds(hash)).toBe(5);
  });

  it("does not end the user's sessions", async () => {
    const formData = new FormData();
    formData.set("password", PASSWORD);
    formData.set("confirmPassword", PASSWORD);

    await addPasswordToGoogleUser(formData);

    expect(mockRepo.updatePassword.mock.calls[0][2]).toEqual({
      revokeSessions: false,
    });
  });

  it("writes the metadata without a password, so nothing is hashed twice", async () => {
    const formData = new FormData();
    formData.set("password", PASSWORD);
    formData.set("confirmPassword", PASSWORD);

    await addPasswordToGoogleUser(formData);

    expect(mockRepo.update).toHaveBeenCalledTimes(1);
    const [userId, data] = mockRepo.update.mock.calls[0];
    expect(userId).toBe("user-123");
    expect(data).not.toHaveProperty("password");
  });
});
