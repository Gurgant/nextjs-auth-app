/**
 * @jest-environment node
 *
 * registerUser and changeUserPassword hand the command bus, and through it the
 * event listeners, the client IP and the User-Agent from the request headers,
 * never values from form fields: the IP as getClientIP reads it (the client
 * controls it unless a trusted proxy overwrites X-Forwarded-For, see
 * SECURITY.md) and the User-Agent cut to 512 characters. The command bus is
 * spied and answers at once; getClientIP is the real one.
 */
const mockHeaders = jest.fn<Promise<Headers>, []>();
jest.mock("next/headers", () => ({
  headers: () => mockHeaders(),
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

// @/lib/security (getClientIP) imports the Prisma client; nothing here uses it.
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

jest.mock("@/lib/utils/form-locale-server", () => ({
  resolveFormLocale: async () => "en",
}));

jest.mock("@/lib/repositories", () => ({
  repositories: { getUserRepository: () => ({}) },
}));

jest.mock("@/lib/events", () => ({
  eventBus: { publish: async () => {} },
}));

import { registerUser, changeUserPassword } from "../auth";
import {
  commandBus,
  RegisterUserCommand,
  ChangePasswordCommand,
} from "@/lib/commands";

const REQUEST_IP = "203.0.113.7";
const REQUEST_AGENT = "Mozilla/5.0 (request)";

/** A form that also carries the two fields a client could choose. */
function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries({
    ...fields,
    ipAddress: "198.51.100.66",
    userAgent: "form-agent",
  })) {
    formData.set(key, value);
  }
  return formData;
}

const ACTIONS = [
  [
    "registerUser",
    RegisterUserCommand,
    () =>
      registerUser(
        form({
          name: "New User",
          email: "new.user@example.com",
          password: "NewPass456!",
          confirmPassword: "NewPass456!",
        }),
      ),
  ],
  [
    "changeUserPassword",
    ChangePasswordCommand,
    () =>
      changeUserPassword(
        form({
          currentPassword: "OldPass123!",
          newPassword: "NewPass456!",
          confirmPassword: "NewPass456!",
        }),
      ),
  ],
] as const;

describe.each(ACTIONS)("%s", (_name, Command, run) => {
  let executeSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    executeSpy = jest
      .spyOn(commandBus, "execute")
      .mockResolvedValue({ success: true, message: "done" });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** The metadata of the one call of the bus. */
  async function metadataOf(requestHeaders: Record<string, string>) {
    mockHeaders.mockResolvedValue(new Headers(requestHeaders));
    await run();
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy.mock.calls[0][0]).toBe(Command);
    return executeSpy.mock.calls[0][2];
  }

  it("takes the client IP and the User-Agent from the request", async () => {
    const metadata = await metadataOf({
      "x-forwarded-for": REQUEST_IP,
      "user-agent": REQUEST_AGENT,
    });

    expect(metadata).toMatchObject({
      ipAddress: REQUEST_IP,
      userAgent: REQUEST_AGENT,
    });
  });

  it("cuts a long User-Agent to 512 characters", async () => {
    const longAgent = "A".repeat(600) + "B".repeat(600);

    const metadata = await metadataOf({ "user-agent": longAgent });

    expect(metadata.userAgent).toBe(longAgent.slice(0, 512));
  });

  it("leaves out a forwarded value that is not an IP address", async () => {
    const metadata = await metadataOf({
      "x-forwarded-for": "<script>, not-an-ip",
    });

    expect(metadata.ipAddress).toBeUndefined();
  });

  it("leaves both out when the request carries neither", async () => {
    const metadata = await metadataOf({});

    expect(metadata.ipAddress).toBeUndefined();
    expect(metadata.userAgent).toBeUndefined();
  });
});
