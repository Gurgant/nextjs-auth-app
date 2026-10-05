/**
 * @jest-environment node
 *
 * An unexpected internal failure inside a command is answered with a generic
 * message: the text of the exception stays in the server log and never
 * reaches the client. Validation and business errors keep their own message.
 * The commands are run without a locale here, so each answer is the English
 * text the command falls back to; what they answer in each of the five
 * languages is in src/lib/actions/__tests__/translated-answers.test.ts.
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
import { getTranslations } from "next-intl/server";
import {
  RegisterUserCommand,
  type RegisterUserInput,
} from "../register-user.command";
import { ChangePasswordCommand } from "../change-password.command";
import { COMMAND_FAILED_MESSAGE } from "../../base/command.base";

const INTERNAL_ERROR = "connect ECONNREFUSED db.internal:5432";
const GENERIC = "Something went wrong. Please try again.";

/** Everything a console spy was handed, objects in their JSON form. */
const printed = (spy: jest.SpyInstance) =>
  spy.mock.calls
    .flat()
    .map((part) => (typeof part === "string" ? part : JSON.stringify(part)))
    .join("\n");

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

  // With a locale the answer is the message of that locale
  // (translated-answers.test.ts). When its messages cannot be read, the
  // command still answers, with the same English text as without a locale.
  describe("a locale whose messages cannot be read", () => {
    beforeEach(() => {
      (getTranslations as unknown as jest.Mock).mockRejectedValue(
        new Error("no messages for this locale"),
      );
    });

    it("RegisterUserCommand answers a refusal with its English text", async () => {
      mockRepo.findByEmail.mockResolvedValue({ id: "u1" });

      const result = await new RegisterUserCommand().execute({
        ...registration,
        locale: "de",
      });

      expect(result).toEqual({
        success: false,
        message: "User already exists",
      });
      expect(getTranslations).toHaveBeenCalledWith({
        locale: "de",
        namespace: "Errors",
      });
    });

    it("RegisterUserCommand answers a new account with its English text", async () => {
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.createWithAccount.mockResolvedValue({
        id: "u1",
        email: registration.email,
        name: registration.name,
      });

      const result = await new RegisterUserCommand().execute({
        ...registration,
        locale: "de",
      });

      expect(result).toEqual({
        success: true,
        message: "Account created successfully! Please sign in.",
        data: { userId: "u1" },
      });
      expect(getTranslations).toHaveBeenCalledWith({
        locale: "de",
        namespace: "Success",
      });
    });
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

    // The schema's own text for the refusal ("Passwords don't match") stays
    // on the server: log() prints it with the error, and the answer is the
    // one message above, without a field and without that text.
    it("answers a confirmation that does not match without the text of the schema", async () => {
      const logSpy = console.log as unknown as jest.SpyInstance;

      const result = await new RegisterUserCommand().execute({
        ...registration,
        confirmPassword: "Different123!",
      });

      expect(result).toEqual({ success: false, message: "Validation failed" });
      expect(JSON.stringify(result)).not.toMatch(/match/i);
      expect(printed(logSpy)).toContain("Passwords don't match");
    });

    // registerUser always hands an object. A project built on the starter can
    // call the command or the bus with anything: an input that is no object
    // fails the schema like any other, and is answered.
    it.each([[null], [undefined]])(
      "answers the input %p as invalid instead of rejecting",
      async (input) => {
        const result = await new RegisterUserCommand().execute(
          input as unknown as RegisterUserInput,
          { commandId: "command-1", timestamp: new Date() },
        );

        expect(result).toEqual({
          success: false,
          message: "Validation failed",
        });
        expect(mockRepo.findByEmail).not.toHaveBeenCalled();
      },
    );

    it("keeps the business message for an e-mail that is already registered", async () => {
      mockRepo.findByEmail.mockResolvedValue({ id: "u1" });

      const result = await new RegisterUserCommand().execute(registration);

      expect(result.success).toBe(false);
      expect(result.message).not.toBe(GENERIC);
      expect(result.message).toMatch(/already exists/i);
    });

    it("logs that refusal without the e-mail address or the name", async () => {
      mockRepo.findByEmail.mockResolvedValue({ id: "u1" });
      const logSpy = console.log as unknown as jest.SpyInstance;
      const warnSpy = console.warn as unknown as jest.SpyInstance;

      await new RegisterUserCommand().execute(registration);

      const lines = [printed(errorSpy), printed(warnSpy), printed(logSpy)].join(
        "\n",
      );
      // The refusal is logged, so the check below has something to look at.
      expect(lines).toContain("ResourceAlreadyExistsError");
      expect(lines).not.toContain(registration.email);
      expect(lines).not.toContain(registration.name);
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

    // As for the registration: the texts of the schema stay on the server.
    it.each([
      [
        "a confirmation that does not match",
        { confirmPassword: "Other789!x" },
        "New passwords don't match",
      ],
      [
        "a new password equal to the current one",
        { newPassword: "OldPass123!", confirmPassword: "OldPass123!" },
        "New password must be different from current password",
      ],
    ])(
      "answers %s without the text of the schema",
      async (_case, fields, schemaText) => {
        const logSpy = console.log as unknown as jest.SpyInstance;

        const result = await new ChangePasswordCommand().execute({
          ...input,
          ...fields,
        });

        expect(result).toEqual({
          success: false,
          message: "Validation failed",
        });
        expect(JSON.stringify(result)).not.toMatch(/match|different/i);
        expect(printed(logSpy)).toContain(schemaText);
        expect(mockRepo.findById).not.toHaveBeenCalled();
      },
    );

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
