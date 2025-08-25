import { onCLS, onINP, onFCP, onLCP, onTTFB } from "web-vitals";

export interface WebVitalMetric {
  id: string;
  name: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  delta: number;
  entries: PerformanceEntry[];
}

export interface PerformanceMetrics {
  cls: number;
  inp: number;
  fcp: number;
  lcp: number;
  ttfb: number;
  timestamp: number;
  url: string;
  userId?: string;
}

// Performance thresholds based on Google recommendations
const PERFORMANCE_THRESHOLDS = {
  CLS: { good: 0.1, poor: 0.25 },
  INP: { good: 200, poor: 500 },
  FCP: { good: 1800, poor: 3000 },
  LCP: { good: 2500, poor: 4000 },
  TTFB: { good: 800, poor: 1800 },
};

const performanceData: Partial<PerformanceMetrics> = {
  timestamp: Date.now(),
  url: typeof window !== "undefined" ? window.location.href : "",
};

function getRating(
  name: string,
  value: number,
): "good" | "needs-improvement" | "poor" {
  const thresholds =
    PERFORMANCE_THRESHOLDS[name as keyof typeof PERFORMANCE_THRESHOLDS];
  if (!thresholds) return "good";

  if (value <= thresholds.good) return "good";
  if (value <= thresholds.poor) return "needs-improvement";
  return "poor";
}

function sendToAnalytics(metric: WebVitalMetric) {
  // Store in performance data
  (performanceData as any)[
    metric.name.toLowerCase() as keyof PerformanceMetrics
  ] = metric.value;

  // Send to analytics service (can be Google Analytics, custom endpoint, etc.)
  console.log("📊 Performance Metric:", {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    url: performanceData.url,
  });

  // Optional: Send to external analytics
  if (typeof window !== "undefined" && process.env.NODE_ENV === "production") {
    fetch("/api/analytics/web-vitals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metric: metric.name,
        value: metric.value,
        rating: metric.rating,
        url: window.location.href,
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
      }),
    }).catch(console.error);
  }
}

export function initWebVitals() {
  if (typeof window === "undefined") return;

  onCLS(sendToAnalytics);
  onINP(sendToAnalytics);
  onFCP(sendToAnalytics);
  onLCP(sendToAnalytics);
  onTTFB(sendToAnalytics);
}

export function getPerformanceSnapshot(): PerformanceMetrics {
  return {
    ...performanceData,
    timestamp: Date.now(),
    url: typeof window !== "undefined" ? window.location.href : "",
  } as PerformanceMetrics;
}

// Account page specific performance tracking
export function trackAccountPageMetrics() {
  if (typeof window === "undefined") return;

  const startTime = performance.now();

  // Track component mount time
  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    entries.forEach((entry) => {
      if (entry.name.includes("account") || entry.name.includes("Account")) {
        console.log(
          `🏗️ Component "${entry.name}" rendered in ${entry.duration.toFixed(2)}ms`,
        );
      }
    });
  });

  try {
    observer.observe({ entryTypes: ["measure", "navigation", "resource"] });
  } catch (error) {
    // Fallback for older browsers
    console.warn("Performance Observer not supported:", error);
  }

  // Track custom account page metrics
  setTimeout(() => {
    const endTime = performance.now();
    const totalTime = endTime - startTime;

    console.log(
      `⚡ Account page initialization completed in ${totalTime.toFixed(2)}ms`,
    );

    // Send custom metric
    sendToAnalytics({
      id: "account-page-init",
      name: "account-page-init",
      value: totalTime,
      rating: getRating("FCP", totalTime), // Use FCP thresholds as approximation
      delta: 0,
      entries: [],
    });
  }, 100);
}
