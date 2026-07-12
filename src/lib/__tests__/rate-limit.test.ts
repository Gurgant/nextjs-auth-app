import {
  isRateLimited,
  recordAttempt,
  clearAttempts,
  __resetRateLimitStore,
  type RateLimitRule,
} from "@/lib/rate-limit";

const rule: RateLimitRule = { limit: 3, windowMs: 1000 };
const T0 = 1_000_000; // fixed clock; time is injected via the `now` param

beforeEach(() => __resetRateLimitStore());

describe("rate-limit", () => {
  it("allows exactly `limit` attempts, then blocks the next", () => {
    for (let i = 0; i < rule.limit; i++) {
      expect(recordAttempt("s", ["a"], rule, T0).blocked).toBe(false);
    }
    const over = recordAttempt("s", ["a"], rule, T0);
    expect(over.blocked).toBe(true);
    expect(over.remaining).toBe(0);
    expect(over.retryAfterSeconds).toBeGreaterThan(0);
    expect(over.retryAfterSeconds).toBeLessThanOrEqual(1); // windowMs = 1000
  });

  it("isRateLimited peeks without consuming", () => {
    for (let i = 0; i < 10; i++) {
      expect(isRateLimited("s", ["a"], rule, T0).blocked).toBe(false);
    }
    // Peeking never incremented, so a full `limit` attempts are still available.
    for (let i = 0; i < rule.limit; i++) {
      expect(recordAttempt("s", ["a"], rule, T0).blocked).toBe(false);
    }
    expect(isRateLimited("s", ["a"], rule, T0).blocked).toBe(true);
  });

  it("reports decreasing `remaining`", () => {
    expect(isRateLimited("s", ["a"], rule, T0).remaining).toBe(3);
    recordAttempt("s", ["a"], rule, T0);
    expect(isRateLimited("s", ["a"], rule, T0).remaining).toBe(2);
    recordAttempt("s", ["a"], rule, T0);
    expect(isRateLimited("s", ["a"], rule, T0).remaining).toBe(1);
  });

  it("resets after the window elapses", () => {
    for (let i = 0; i < rule.limit; i++) recordAttempt("s", ["a"], rule, T0);
    expect(isRateLimited("s", ["a"], rule, T0).blocked).toBe(true);

    const later = T0 + rule.windowMs; // window boundary
    expect(isRateLimited("s", ["a"], rule, later).blocked).toBe(false);
    expect(recordAttempt("s", ["a"], rule, later).blocked).toBe(false);
  });

  it("blocks if ANY key is over the limit (shared IP across accounts)", () => {
    // Three distinct accounts spraying from one IP exhaust the IP counter.
    recordAttempt("s", ["acctA", "ip1"], rule, T0);
    recordAttempt("s", ["acctB", "ip1"], rule, T0);
    recordAttempt("s", ["acctC", "ip1"], rule, T0);

    // A fresh account from the same IP is blocked by the IP counter...
    expect(isRateLimited("s", ["acctD", "ip1"], rule, T0).blocked).toBe(true);
    // ...but the same account from a different IP is fine.
    expect(isRateLimited("s", ["acctD", "ip2"], rule, T0).blocked).toBe(false);
  });

  it("clearAttempts resets the counters (successful auth)", () => {
    for (let i = 0; i < rule.limit; i++) recordAttempt("s", ["a"], rule, T0);
    expect(isRateLimited("s", ["a"], rule, T0).blocked).toBe(true);
    clearAttempts("s", ["a"]);
    expect(isRateLimited("s", ["a"], rule, T0).blocked).toBe(false);
  });

  it("ignores empty / nullish keys", () => {
    for (let i = 0; i < 20; i++) {
      expect(recordAttempt("s", [null, undefined, ""], rule, T0).blocked).toBe(
        false,
      );
    }
  });

  it("keeps scopes independent", () => {
    for (let i = 0; i < rule.limit; i++)
      recordAttempt("scopeA", ["a"], rule, T0);
    expect(isRateLimited("scopeA", ["a"], rule, T0).blocked).toBe(true);
    expect(isRateLimited("scopeB", ["a"], rule, T0).blocked).toBe(false);
  });
});
