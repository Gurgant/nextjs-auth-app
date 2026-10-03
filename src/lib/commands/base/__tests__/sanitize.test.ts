/**
 * @jest-environment node
 *
 * The one sanitizer used for command input and output (the events the bus
 * publishes; the audit log keeps neither).
 */
import {
  REDACTED,
  sanitizeCommandInput,
  sanitizeCommandOutput,
} from "../sanitize";

describe("sanitizeCommandInput", () => {
  it.each([
    "password",
    "confirmPassword",
    "currentPassword",
    "newPassword",
    "token",
    "secret",
  ])("redacts %s", (field) => {
    expect(sanitizeCommandInput({ [field]: "plain-value" })).toEqual({
      [field]: REDACTED,
    });
  });

  it("uses the [REDACTED] marker", () => {
    expect(REDACTED).toBe("[REDACTED]");
  });

  it("keeps every other field", () => {
    expect(
      sanitizeCommandInput({
        email: "alice@example.com",
        locale: "it",
        password: "Plain123!",
      }),
    ).toEqual({
      email: "alice@example.com",
      locale: "it",
      password: REDACTED,
    });
  });

  it("does not mutate the input object", () => {
    const input = { password: "Plain123!", name: "Alice" };

    sanitizeCommandInput(input);

    expect(input).toEqual({ password: "Plain123!", name: "Alice" });
  });

  it.each([undefined, null, ""])("returns %p as it is", (input) => {
    expect(sanitizeCommandInput(input)).toBe(input);
  });
});

describe("sanitizeCommandOutput", () => {
  it("redacts a top-level token and a token inside data", () => {
    expect(
      sanitizeCommandOutput({
        success: true,
        token: "top-secret",
        data: { token: "nested-secret", userId: "u1" },
      }),
    ).toEqual({
      success: true,
      token: REDACTED,
      data: { token: REDACTED, userId: "u1" },
    });
  });

  it("leaves the original output and its data object unchanged", () => {
    const original = {
      success: true,
      token: "top-secret",
      data: { token: "nested-secret", userId: "u1" },
    };

    const result = sanitizeCommandOutput(original) as typeof original;

    expect(original.token).toBe("top-secret");
    expect(original.data.token).toBe("nested-secret");
    expect(result.data).not.toBe(original.data);
  });

  it("returns an equal copy of an output without tokens", () => {
    const original = { success: true, data: { userId: "u1" } };

    expect(sanitizeCommandOutput(original)).toEqual(original);
  });

  it("accepts an output without data and an output whose data is null", () => {
    expect(sanitizeCommandOutput({ success: false, message: "No" })).toEqual({
      success: false,
      message: "No",
    });
    expect(sanitizeCommandOutput({ success: true, data: null })).toEqual({
      success: true,
      data: null,
    });
  });

  it.each([undefined, null])("returns %p as it is", (output) => {
    expect(sanitizeCommandOutput(output)).toBe(output);
  });
});
