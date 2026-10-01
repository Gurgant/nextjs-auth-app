import {
  LAST_LOGIN_METHOD_COOKIE,
  LOGIN_METHODS,
  parseLoginMethod,
  readLastLoginMethod,
} from "../last-login-method";

describe("parseLoginMethod", () => {
  it.each(LOGIN_METHODS)("accepts %s", (method) => {
    expect(parseLoginMethod(method)).toBe(method);
  });

  it.each([
    ["an unknown provider", "github"],
    ["the old 'email' label", "email"],
    ["a different case", "Google"],
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["a number", 1],
    ["an object", { provider: "google" }],
  ])("rejects %s", (_label, value) => {
    expect(parseLoginMethod(value)).toBeNull();
  });
});

describe("readLastLoginMethod", () => {
  it("finds the cookie among others", () => {
    expect(
      readLastLoginMethod(
        `NEXT_LOCALE=en; ${LAST_LOGIN_METHOD_COOKIE}=google; other=1`,
      ),
    ).toBe("google");
  });

  it("reads it when it is the only cookie", () => {
    expect(readLastLoginMethod(`${LAST_LOGIN_METHOD_COOKIE}=credentials`)).toBe(
      "credentials",
    );
  });

  it("returns null without the cookie", () => {
    expect(readLastLoginMethod("")).toBeNull();
    expect(readLastLoginMethod("NEXT_LOCALE=en; other=1")).toBeNull();
  });

  it("returns null for a value that is not a known method", () => {
    expect(
      readLastLoginMethod(`${LAST_LOGIN_METHOD_COOKIE}=<script>`),
    ).toBeNull();
  });

  it("does not match a cookie whose name only ends with ours", () => {
    expect(
      readLastLoginMethod(`x-${LAST_LOGIN_METHOD_COOKIE}=google`),
    ).toBeNull();
  });
});
