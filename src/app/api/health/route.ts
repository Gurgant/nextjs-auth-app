import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Health check endpoint for monitoring and load balancers
 * Returns system status and dependency health
 */
export async function GET(_request: NextRequest) {
  const startTime = Date.now();
  const checks: Record<string, any> = {};
  let overallStatus = "healthy";

  try {
    // Database connectivity check
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      checks.database = {
        status: "healthy",
        responseTime: Date.now() - dbStart,
        message: "Database connection successful",
      };
    } catch (error) {
      // The driver message can name the host, port or user: log it, never
      // return it from this public endpoint.
      console.error("Health check: database unreachable:", error);
      checks.database = {
        status: "unhealthy",
        responseTime: Date.now() - startTime,
        message: "Database connection failed (see server logs)",
      };
      overallStatus = "unhealthy";
    }

    // Environment check: only what the app cannot run without (Google OAuth
    // and e-mail are optional). Names are logged server-side, never returned
    // by this public endpoint.
    const missingEnvVars = [
      !process.env.DATABASE_URL && "DATABASE_URL",
      !(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET) &&
        "AUTH_SECRET",
      !process.env.ENCRYPTION_KEY && "ENCRYPTION_KEY",
    ].filter(Boolean);

    checks.environment = {
      status: missingEnvVars.length === 0 ? "healthy" : "unhealthy",
      message:
        missingEnvVars.length === 0
          ? "Required configuration present"
          : "Required configuration missing (see server logs)",
    };

    if (missingEnvVars.length > 0) {
      console.error("Health check: missing configuration:", missingEnvVars);
      overallStatus = "unhealthy";
    }

    // Memory usage check
    if (typeof process !== "undefined" && process.memoryUsage) {
      const memUsage = process.memoryUsage();
      const memUsageMB = {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
      };

      // Reported for information only. V8 grows heapTotal lazily, so
      // heapUsed/heapTotal is routinely above 90 % on a healthy, freshly
      // started process (measured: 93 %); it must not fail the health check.
      const heapUsagePercent =
        (memUsageMB.heapUsed / memUsageMB.heapTotal) * 100;

      checks.memory = {
        status: "info",
        usage: memUsageMB,
        heapUsagePercent: Math.round(heapUsagePercent),
      };
    }

    // System info (no runtime/platform versions: this endpoint is public)
    const systemInfo = {
      uptime: Math.round(process.uptime()),
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
    };

    const totalResponseTime = Date.now() - startTime;

    // Prepare response
    const healthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      responseTime: totalResponseTime,
      version: process.env.npm_package_version || "1.0.0",
      system: systemInfo,
      checks,
    };

    // Return appropriate HTTP status
    const httpStatus = overallStatus === "healthy" ? 200 : 503;

    return NextResponse.json(healthResponse, {
      status: httpStatus,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    // Fallback error response
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        message: "Health check failed",
        error:
          process.env.NODE_ENV === "development"
            ? error
            : "Internal server error",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  }
}
