/**
 * @jest-environment node
 */

/**
 * What is kept of a request. requestMetadata() reads the client IP and the
 * User-Agent for everything that stores them or hands them on (the security
 * events, the command metadata), and logSecurityEvent() applies the same
 * bounds to whatever a caller hands it. The client chooses both values: an
 * address is kept only when it is one, and the User-Agent is cut to 512
 * characters.
 */

const mockCreate = jest.fn();
jest.mock("@/lib/prisma", () => ({
  prisma: { securityEvent: { create: (args: unknown) => mockCreate(args) } },
}));

import { logSecurityEvent, requestMetadata } from "@/lib/security";

const headers = (entries: Record<string, string>) => new Headers(entries);

// 600 + 600 characters: a cut at 512 ends inside the first run.
const LONG_AGENT = "A".repeat(600) + "B".repeat(600);
const AGENT_OF_512 = "A".repeat(511) + "Z";

describe("requestMetadata", () => {
  it("takes the client IP as getClientIP reads it, and the User-Agent", () => {
    expect(
      requestMetadata(
        headers({
          "x-forwarded-for": "::ffff:203.0.113.7, 198.51.100.9",
          "x-real-ip": "192.0.2.44",
          "user-agent": "Mozilla/5.0 (request)",
        }),
      ),
    ).toStrictEqual({
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0 (request)",
    });
  });

  it("leaves out a forwarded value that is not an IP address", () => {
    expect(
      requestMetadata(headers({ "x-forwarded-for": "<script>, unknown" })),
    ).toStrictEqual({ ipAddress: undefined, userAgent: undefined });
  });

  it("keeps a User-Agent of 512 characters whole", () => {
    expect(
      requestMetadata(headers({ "user-agent": AGENT_OF_512 })).userAgent,
    ).toBe(AGENT_OF_512);
  });

  it("cuts a longer User-Agent to its first 512 characters", () => {
    const { userAgent } = requestMetadata(
      headers({ "user-agent": LONG_AGENT }),
    );

    expect(userAgent).toBe("A".repeat(512));
  });

  it.each([
    ["has no such headers", {}],
    ["has an empty User-Agent", { "user-agent": "" }],
  ])("leaves both out when the request %s", (_case, entries) => {
    expect(requestMetadata(headers(entries))).toStrictEqual({
      ipAddress: undefined,
      userAgent: undefined,
    });
  });
});

describe("logSecurityEvent", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ id: "event-1" });
  });

  /** The `data` of the one row written. */
  function written(): unknown {
    expect(mockCreate).toHaveBeenCalledTimes(1);
    return mockCreate.mock.calls[0][0].data;
  }

  it("writes the event with the address and the User-Agent it is given", async () => {
    await logSecurityEvent({
      userId: "user-1",
      eventType: "2fa_enabled",
      details: "Two-factor authentication enabled",
      metadata: { trigger: "test" },
      ipAddress: "2001:db8::1",
      userAgent: AGENT_OF_512,
    });

    expect(written()).toStrictEqual({
      userId: "user-1",
      eventType: "2fa_enabled",
      details: "Two-factor authentication enabled",
      metadata: { trigger: "test" },
      ipAddress: "2001:db8::1",
      userAgent: AGENT_OF_512,
      success: true,
    });
  });

  // A caller that read the header by itself, as authorize() does for the
  // "account_locked" event.
  it("cuts a User-Agent longer than 512 characters", async () => {
    await logSecurityEvent({
      userId: "user-1",
      eventType: "account_locked",
      success: false,
      userAgent: LONG_AGENT,
    });

    expect(written()).toMatchObject({
      eventType: "account_locked",
      success: false,
      userAgent: "A".repeat(512),
    });
  });

  it.each(["203.0.113.7, 198.51.100.9", "unknown", "<script>", ""])(
    "does not store %p as the address: it is not one",
    async (ipAddress) => {
      await logSecurityEvent({
        userId: "user-1",
        eventType: "2fa_disabled",
        ipAddress,
        userAgent: "",
      });

      expect(written()).toMatchObject({
        ipAddress: undefined,
        userAgent: undefined,
      });
    },
  );

  it("does not throw when the row cannot be written", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    mockCreate.mockRejectedValue(new Error("connection refused"));

    await expect(
      logSecurityEvent({ userId: "user-1", eventType: "2fa_enabled" }),
    ).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });
});
