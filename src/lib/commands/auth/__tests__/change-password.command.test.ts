/**
 * @jest-environment node
 *
 * A password change ends every session of the user: the command stores the new
 * hash and asks the repository to revoke the sessions in the same call, says
 * so in its answer, and publishes the event with requiresLogout.
 */
const mockRepo = {
  findById: jest.fn(),
  updatePassword: jest.fn(),
  update: jest.fn(),
};
jest.mock("@/lib/repositories", () => ({
  repositories: { getUserRepository: () => mockRepo },
}));

jest.mock("@/lib/events", () => ({
  eventBus: { publish: jest.fn() },
}));

import bcrypt from "bcryptjs";
import { eventBus } from "@/lib/events";
import { PasswordChangedEvent } from "@/lib/events/domain/auth.events";
import { ChangePasswordCommand } from "../change-password.command";

const mockPublish = eventBus.publish as unknown as jest.Mock;

/** The password events among everything published (error.log() publishes too). */
const passwordChangedEvents = (): PasswordChangedEvent[] =>
  mockPublish.mock.calls
    .map(([event]) => event)
    .filter((event) => event instanceof PasswordChangedEvent);

const CURRENT = "OldPass123!";
const NEW = "NewPass456!";
const input = {
  userId: "user-1",
  currentPassword: CURRENT,
  newPassword: NEW,
  confirmPassword: NEW,
};

describe("ChangePasswordCommand ends the user's sessions", () => {
  const previousRounds = process.env.BCRYPT_ROUNDS;

  beforeEach(async () => {
    // next/jest loads the developer's .env: pin the cost so the test is fast.
    process.env.BCRYPT_ROUNDS = "4";
    jest.resetAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});

    mockRepo.findById.mockResolvedValue({
      id: "user-1",
      password: await bcrypt.hash(CURRENT, 4),
    });
    mockRepo.updatePassword.mockResolvedValue(undefined);
    mockRepo.update.mockResolvedValue({ id: "user-1" });
    mockPublish.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (previousRounds === undefined) {
      delete process.env.BCRYPT_ROUNDS;
    } else {
      process.env.BCRYPT_ROUNDS = previousRounds;
    }
  });

  it("stores the new hash and revokes the sessions in one repository call", async () => {
    const result = await new ChangePasswordCommand().execute(input);

    expect(result.success).toBe(true);
    expect(mockRepo.updatePassword).toHaveBeenCalledTimes(1);
    const [userId, hash, options] = mockRepo.updatePassword.mock.calls[0];
    expect(userId).toBe("user-1");
    expect(await bcrypt.compare(NEW, hash)).toBe(true);
    expect(options).toEqual({ revokeSessions: true });
  });

  it("tells the user to sign in again", async () => {
    const result = await new ChangePasswordCommand().execute(input);

    expect(result.message).toBe(
      "Password changed successfully! Please sign in again.",
    );
  });

  it("publishes the event with requiresLogout", async () => {
    await new ChangePasswordCommand().execute(input);

    const events = passwordChangedEvents();
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({
      userId: "user-1",
      requiresLogout: true,
    });
  });

  it("leaves the password and the sessions alone when the current password is wrong", async () => {
    const result = await new ChangePasswordCommand().execute({
      ...input,
      currentPassword: "Wrong123!x",
    });

    expect(result.success).toBe(false);
    expect(mockRepo.updatePassword).not.toHaveBeenCalled();
    expect(passwordChangedEvents()).toEqual([]);
  });
});
