/**
 * @jest-environment node
 *
 * An unexpected internal failure inside a command is answered with a generic
 * message: the text of the exception stays in the server log and never
 * reaches the client. Validation and business errors keep their own message.
 */
const mockRepo = {
  findByEmail: jest.fn(),
  findById: jest.fn(),
  createWithAccount: jest.fn(),
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
import { RegisterUserCommand } from "../register-user.command";
import { ChangePasswordCommand } from "../change-password.command";
import { COMMAND_FAILED_MESSAGE } from "../../base/command.base";

const INTERNAL_ERROR = "connect ECONNREFUSED db.internal:5432";
const GENERIC = "Something went wrong. Please try again.";

const registration = {
  name: "Alice Example",
  email: "alice@example.com",
  password: "ValidPass123!",
  confirmPassword: "ValidPass123!",
};

describe("commands do not return raw exception messages (CMD-9)", () => {
  const previousRounds = process.env.BCRYPT_ROUNDS;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.BCRYPT_ROUNDS = "4";
    // Reset, not clear: an implementation set by one test must not reach the
    // next one. Every test sets the repository answers it needs.
    jest.resetAllMocks();
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (previousRounds === undefined) {
      delete process.env.BCRYPT_ROUNDS;
    } else {
      process.env.BCRYPT_ROUNDS = previousRounds;
    }
  });

  it("uses the app's generic error text", () => {
    expect(COMMAND_FAILED_MESSAGE).toBe(GENERIC);
  });

  describe("RegisterUserCommand", () => {
    it("answers a repository failure with the generic message", async () => {
      mockRepo.findByEmail.mockRejectedValue(new Error(INTERNAL_ERROR));

      const result = await new RegisterUserCommand().execute(registration);

      expect(result.success).toBe(false);
      expect(result.message).toBe(GENERIC);
      expect(JSON.stringify(result)).not.toContain("db.internal");
    });

    it("still logs the real error on the server", async () => {
      mockRepo.findByEmail.mockRejectedValue(new Error(INTERNAL_ERROR));

      await new RegisterUserCommand().execute(registration);

      expect(errorSpy).toHaveBeenCalledWith(
        "[Command] Error RegisterUserCommand",
        expect.objectContaining({ error: INTERNAL_ERROR }),
      );
    });

    it("keeps the validation message", async () => {
      const result = await new RegisterUserCommand().execute({
        ...registration,
        confirmPassword: "Different123!",
      });

      expect(result).toMatchObject({
        success: false,
        message: "Validation failed",
      });
      // Answered before the repository is asked: no repository answer is set.
      expect(mockRepo.findByEmail).not.toHaveBeenCalled();
    });

    it("keeps the business message for an e-mail that is already registered", async () => {
      mockRepo.findByEmail.mockResolvedValue({ id: "u1" });

      const result = await new RegisterUserCommand().execute(registration);

      expect(result.success).toBe(false);
      expect(result.message).not.toBe(GENERIC);
      expect(result.message).toMatch(/already exists/i);
    });
  });

  describe("ChangePasswordCommand", () => {
    const input = {
      userId: "user-1",
      currentPassword: "OldPass123!",
      newPassword: "NewPass456!",
      confirmPassword: "NewPass456!",
    };

    const existingUser = async () => ({
      id: "user-1",
      password: await bcrypt.hash("OldPass123!", 4),
    });

    it("answers a repository failure with the generic message", async () => {
      mockRepo.findById.mockResolvedValue(await existingUser());
      mockRepo.updatePassword.mockRejectedValue(new Error(INTERNAL_ERROR));

      const result = await new ChangePasswordCommand().execute(input);

      expect(result.success).toBe(false);
      expect(result.message).toBe(GENERIC);
      expect(JSON.stringify(result)).not.toContain("db.internal");
    });

    it("answers a failing user lookup with the generic message", async () => {
      mockRepo.findById.mockRejectedValue(new Error(INTERNAL_ERROR));

      const result = await new ChangePasswordCommand().execute(input);

      expect(result.success).toBe(false);
      expect(result.message).toBe(GENERIC);
    });

    it("still logs the real error on the server", async () => {
      mockRepo.findById.mockResolvedValue(await existingUser());
      mockRepo.updatePassword.mockRejectedValue(new Error(INTERNAL_ERROR));

      await new ChangePasswordCommand().execute(input);

      expect(errorSpy).toHaveBeenCalledWith(
        "[Command] Error ChangePasswordCommand",
        expect.objectContaining({ error: INTERNAL_ERROR }),
      );
    });

    it("keeps the message for a wrong current password", async () => {
      mockRepo.findById.mockResolvedValue(await existingUser());

      const result = await new ChangePasswordCommand().execute({
        ...input,
        currentPassword: "Wrong123!x",
      });

      expect(result).toMatchObject({
        success: false,
        message: "Invalid input for field: currentPassword",
      });
      expect(mockRepo.updatePassword).not.toHaveBeenCalled();
    });
  });
});
