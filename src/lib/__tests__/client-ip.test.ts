/**
 * @jest-environment node
 */

/**
 * getClientIP() feeds the IP key of every rate limiter. It must recognise the
 * address forms proxies actually send — in particular compressed IPv6 — or
 * those clients silently escape all IP-keyed limits.
 */

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { getClientIP, isValidIP } from "@/lib/security";

const headers = (entries: Record<string, string>) => new Headers(entries);

describe("isValidIP", () => {
  it.each([
    "203.0.113.7",
    "2001:0db8:0000:0000:0000:0000:0000:0001",
    "2001:db8::1",
    "::1",
    "fe80::1",
  ])("accepts %s", (ip) => {
    expect(isValidIP(ip)).toBe(true);
  });

  it.each(["", "unknown", "300.1.1.1", "1.2.3", "2001:db8:::1", "<script>"])(
    "rejects %p",
    (ip) => {
      expect(isValidIP(ip)).toBe(false);
    },
  );
});

describe("getClientIP", () => {
  it("returns a compressed IPv6 address from X-Forwarded-For", () => {
    expect(getClientIP(headers({ "x-forwarded-for": "2001:db8::1" }))).toBe(
      "2001:db8::1",
    );
  });

  it("unwraps IPv4-mapped IPv6 so one client has one key", () => {
    expect(
      getClientIP(headers({ "x-forwarded-for": "::ffff:203.0.113.7" })),
    ).toBe("203.0.113.7");
  });

  it("takes the first valid entry of X-Forwarded-For", () => {
    expect(
      getClientIP(
        headers({ "x-forwarded-for": "garbage, 198.51.100.4, 10.0.0.1" }),
      ),
    ).toBe("198.51.100.4");
  });

  it("falls back to X-Real-IP, then gives up", () => {
    expect(getClientIP(headers({ "x-real-ip": "198.51.100.9" }))).toBe(
      "198.51.100.9",
    );
    expect(getClientIP(headers({ "x-forwarded-for": "nope" }))).toBeUndefined();
    expect(getClientIP(headers({}))).toBeUndefined();
  });
});

describe("isValidIP edge cases", () => {
  it.each(["::", "::ffff:203.0.113.7", "2001:db8:0:0:0:0:2:1", "1::"])(
    "accepts %s",
    (ip) => {
      expect(isValidIP(ip)).toBe(true);
    },
  );

  it.each([
    "1:2:3:4:5:6:7:8:9",
    "1::2::3",
    "12345::1",
    "::ffff:999.0.0.1",
    "g::1",
    "1:2:3:4:5:6:7::8:9",
  ])("rejects %p", (ip) => {
    expect(isValidIP(ip)).toBe(false);
  });
});
