import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/prisma";

/**
 * Admin metrics endpoint - system, database and security-event figures.
 * ADMIN role required (enforced by withRole).
 */
const getMetrics = async (_request: NextRequest) => {
  try {
    const startTime = Date.now();

    // Get system metrics
    const memoryUsage = process.memoryUsage();
    const systemInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      uptime: Math.round(process.uptime()),
      environment: process.env.NODE_ENV || "development",
      pid: process.pid,
    };

    // Get database statistics
    let databaseStats = null;
    try {
      // Count total users
      const userCount = await prisma.user.count();

      // Get recent security events
      const recentSecurityEvents = await prisma.securityEvent.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        select: {
          eventType: true,
          success: true,
          createdAt: true,
          details: true,
        },
      });

      databaseStats = {
        userCount,
        recentSecurityEvents: recentSecurityEvents.map((event) => ({
          type: event.eventType,
          success: event.success,
          timestamp: event.createdAt,
          details: event.details,
        })),
      };
    } catch {
      databaseStats = { error: "Failed to fetch database statistics" };
    }

    // Calculate recent error rates (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let errorRate = null;
    try {
      const [totalEvents, errorEvents] = await Promise.all([
        prisma.securityEvent.count({
          where: { createdAt: { gte: oneHourAgo } },
        }),
        prisma.securityEvent.count({
          where: {
            createdAt: { gte: oneHourAgo },
            success: false,
          },
        }),
      ]);

      errorRate = {
        total: totalEvents,
        errors: errorEvents,
        rate:
          totalEvents > 0 ? Math.round((errorEvents / totalEvents) * 100) : 0,
        period: "1 hour",
      };
    } catch {
      errorRate = { error: "Failed to calculate error rate" };
    }

    // Response time for this request
    const responseTime = Date.now() - startTime;

    // Build comprehensive metrics response
    const metrics = {
      timestamp: new Date().toISOString(),
      responseTime,
      system: {
        ...systemInfo,
        memory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
          heapUsagePercent: Math.round(
            (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
          ),
        },
      },
      database: databaseStats,
      security: {
        errorRate,
        recentEvents: databaseStats?.recentSecurityEvents || [],
      },
      alerts: {
        highMemoryUsage: memoryUsage.heapUsed / memoryUsage.heapTotal > 0.8,
        highErrorRate: (errorRate?.rate || 0) > 5,
      },
    };

    return NextResponse.json(metrics, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("Metrics endpoint error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch metrics",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
};

export const GET = withRole("ADMIN", getMetrics);
