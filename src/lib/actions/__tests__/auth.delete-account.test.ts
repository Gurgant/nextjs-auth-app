/**
 * @jest-environment node
 *
 * deleteUserAccount answers "deleted" only when the row is gone. The sessions
 * of a deleted account end because the row no longer exists (see
 * src/lib/auth/session-revocation.ts): an account that was not deleted keeps
 * them, so the action must not report success for it.
 */
// Translations answer with the English fallback the action passes in.
jest.mock("@/lib/utils/server-translations", () => ({
  translateError: async (_locale: string, key: string, fallback?: string) =>
    fallback ?? key,
  translateSuccess: async (_locale: string, key: string, fallback?: string) =>
    fallback ?? key,
  translateCommonError: async () => "An error occurred",
}));

jest.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

jest.mock("@/lib/utils/form-locale-server", () => ({
  resolveFormLocale: async () => "en",
}));

const mockRepo = {
  delete: jest.fn(),
};
jest.mock("@/lib/repositories", () => ({
  repositories: { getUserRepository: () => mockRepo },
}));

jest.mock("@/lib/events", () => ({
  eventBus: { publish: async () => {} },
}));

import { deleteUserAccount } from "../auth";

const EMAIL = "owner@example.com";

function confirmation(email: string): FormData {
  const formData = new FormData();
  formData.set("confirmEmail", email);
  return formData;
}

describe("deleteUserAccount", () => {
  beforeEach(() => {
    // Clear, not reset: the validation answer uses the next-intl mock of
    // jest.setup.js. Every answer this file needs is set again below.
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockAuth.mockResolvedValue({ user: { id: "user-123", email: EMAIL } });
    mockRepo.delete.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("deletes the signed-in user and answers success", async () => {
    const result = await deleteUserAccount(confirmation(EMAIL));

    expect(mockRepo.delete).toHaveBeenCalledTimes(1);
    expect(mockRepo.delete).toHaveBeenCalledWith("user-123");
    expect(result).toMatchObject({
      success: true,
      message: "Account deleted successfully",
    });
  });

  it("answers an error when the row was not deleted", async () => {
    // The repository swallows a database error and answers false.
    mockRepo.delete.mockResolvedValue(false);

    const result = await deleteUserAccount(confirmation(EMAIL));

    expect(mockRepo.delete).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: false,
      message: "Failed to delete account. Please try again.",
    });
  });

  it("deletes nothing when the confirmation is not the session's e-mail", async () => {
    const result = await deleteUserAccount(confirmation("other@example.com"));

    expect(mockRepo.delete).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it("deletes nothing without a session", async () => {
    mockAuth.mockResolvedValue(null);

    const result = await deleteUserAccount(confirmation(EMAIL));

    expect(mockRepo.delete).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      message: "You must be signed in to delete your account.",
    });
  });
});
