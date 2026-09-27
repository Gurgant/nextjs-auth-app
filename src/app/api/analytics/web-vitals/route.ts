import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

import {
  recentWebVitals,
  recordWebVital,
  type StoredWebVital,
} from "@/lib/performance/web-vitals-store";

// Demo collector (see src/lib/performance/web-vitals-store.ts): anonymous POSTs
// are accepted, so the store validates, trims and caps everything it keeps.
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const data: unknown = await request.json();

    if (!recordWebVital(data, session?.user?.id || "anonymous")) {
      return NextResponse.json(
        { error: "Invalid metric data" },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error storing web vital:", error);
    return NextResponse.json(
      { error: "Failed to store metric" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    // Return aggregated metrics
    const last24Hours = recentWebVitals(24 * 60 * 60 * 1000);

    const aggregated = {
      total: last24Hours.length,
      metrics: {
        CLS: calculateAverage(last24Hours, "CLS"),
        INP: calculateAverage(last24Hours, "INP"),
        FCP: calculateAverage(last24Hours, "FCP"),
        LCP: calculateAverage(last24Hours, "LCP"),
        TTFB: calculateAverage(last24Hours, "TTFB"),
      },
      ratings: {
        good: last24Hours.filter((m) => m.rating === "good").length,
        needsImprovement: last24Hours.filter(
          (m) => m.rating === "needs-improvement",
        ).length,
        poor: last24Hours.filter((m) => m.rating === "poor").length,
      },
    };

    return NextResponse.json({
      success: true,
      data: aggregated,
      period: "last24hours",
    });
  } catch (error) {
    console.error("Error retrieving metrics:", error);
    return NextResponse.json(
      { error: "Failed to retrieve metrics" },
      { status: 500 },
    );
  }
}

function calculateAverage(metrics: StoredWebVital[], metricName: string) {
  const filtered = metrics.filter((m) => m.metric === metricName);
  if (filtered.length === 0) return null;

  const sum = filtered.reduce((acc, m) => acc + m.value, 0);
  return Math.round((sum / filtered.length) * 100) / 100;
}
