/**
 * In-memory web-vitals store behind the public /api/analytics/web-vitals
 * endpoint (demo only — use an analytics service in production).
 *
 * The endpoint accepts anonymous POSTs, so everything here is bounded: at most
 * MAX_STORED_METRICS entries, and each entry keeps only validated fields with
 * capped string lengths — never the raw client JSON.
 */

export const MAX_STORED_METRICS = 1000;
const MAX_TEXT = 200;

const WEB_VITALS = new Set(["CLS", "INP", "FCP", "LCP", "TTFB"]);
const RATINGS = new Set(["good", "needs-improvement", "poor"]);

export interface StoredWebVital {
  metric: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor" | "unknown";
  url: string;
  timestamp: number;
  userId: string;
}

const store: StoredWebVital[] = [];

const text = (v: unknown) =>
  typeof v === "string" ? v.slice(0, MAX_TEXT) : "";

/** Validate and store one metric; returns false (nothing stored) if invalid. */
export function recordWebVital(input: unknown, userId: string): boolean {
  if (!input || typeof input !== "object") return false;
  const data = input as Record<string, unknown>;
  if (
    typeof data.metric !== "string" ||
    !WEB_VITALS.has(data.metric) ||
    typeof data.value !== "number" ||
    !Number.isFinite(data.value)
  ) {
    return false;
  }

  store.push({
    metric: data.metric,
    value: data.value,
    rating: RATINGS.has(data.rating as string)
      ? (data.rating as StoredWebVital["rating"])
      : "unknown",
    url: text(data.url),
    timestamp:
      typeof data.timestamp === "number" && Number.isFinite(data.timestamp)
        ? data.timestamp
        : Date.now(),
    userId: text(userId),
  });
  if (store.length > MAX_STORED_METRICS) {
    store.splice(0, store.length - MAX_STORED_METRICS);
  }
  return true;
}

/** Entries newer than `windowMs` (copies, so callers cannot mutate the store). */
export function recentWebVitals(
  windowMs: number,
  now: number = Date.now(),
): StoredWebVital[] {
  return store
    .filter((m) => now - m.timestamp < windowMs)
    .map((m) => ({ ...m }));
}

/** Test-only: empty the store. */
export function __resetWebVitals(): void {
  store.length = 0;
}
