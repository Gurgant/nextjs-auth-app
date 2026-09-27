import {
  MAX_STORED_METRICS,
  __resetWebVitals,
  recentWebVitals,
  recordWebVital,
} from "@/lib/performance/web-vitals-store";

const DAY = 24 * 60 * 60 * 1000;
const sample = (extra: Record<string, unknown> = {}) => ({
  metric: "LCP",
  value: 1200,
  rating: "good",
  url: "/en",
  timestamp: Date.now(),
  ...extra,
});

beforeEach(() => __resetWebVitals());

it("keeps only validated fields, never the raw client JSON", () => {
  expect(
    recordWebVital(
      sample({ junk: "x".repeat(100_000), url: "/" + "a".repeat(5000) }),
      "user-1",
    ),
  ).toBe(true);

  const [stored] = recentWebVitals(DAY);
  expect(Object.keys(stored).sort()).toEqual(
    ["metric", "rating", "timestamp", "url", "userId", "value"].sort(),
  );
  expect(stored.url.length).toBe(200);
});

it("normalises unknown ratings and bad timestamps", () => {
  recordWebVital(sample({ rating: "excellent", timestamp: "soon" }), "u");
  const [stored] = recentWebVitals(DAY);
  expect(stored.rating).toBe("unknown");
  expect(typeof stored.timestamp).toBe("number");
});

it.each([
  ["an unknown metric", sample({ metric: "anything" })],
  ["a non-numeric value", sample({ value: "12" })],
  ["an infinite value", sample({ value: Infinity })],
  ["a non-object", "LCP=1200"],
])("rejects %s", (_label, input) => {
  expect(recordWebVital(input, "u")).toBe(false);
  expect(recentWebVitals(DAY)).toHaveLength(0);
});

it(`never holds more than ${MAX_STORED_METRICS} entries`, () => {
  for (let i = 0; i < MAX_STORED_METRICS + 50; i++) {
    recordWebVital(sample(), "u");
  }
  expect(recentWebVitals(DAY)).toHaveLength(MAX_STORED_METRICS);
});
