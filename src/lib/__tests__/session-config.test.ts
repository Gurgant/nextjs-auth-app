import {
  DEFAULT_SESSION_MAX_AGE_SECONDS,
  resolveSessionMaxAge,
} from "@/lib/session-config";

describe("resolveSessionMaxAge", () => {
  it("defaults to 7 days, in seconds", () => {
    expect(DEFAULT_SESSION_MAX_AGE_SECONDS).toBe(7 * 24 * 60 * 60);
    expect(resolveSessionMaxAge(undefined)).toBe(604800);
  });

  it.each(["300", "86400", "2592000"])("returns %s as given", (raw) => {
    expect(resolveSessionMaxAge(raw)).toBe(Number(raw));
  });

  it.each(["299", "2592001", "7", "604800000", "abc", "1.5", "-5", ""])(
    "falls back to the default for %p",
    (raw) => {
      expect(resolveSessionMaxAge(raw)).toBe(DEFAULT_SESSION_MAX_AGE_SECONDS);
    },
  );
});
