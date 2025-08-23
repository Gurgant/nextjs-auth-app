import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Health check endpoint for monitoring and load balancers
 * Returns system status and dependency health
 */
export async function GET(request: NextRequest) {
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
      checks.database = {
        status: "unhealthy",
        responseTime: Date.now() - startTime,
        message:
          error instanceof Error ? error.message : "Database connection failed",
        error: process.env.NODE_ENV === "development" ? error : undefined,
      };
      overallStatus = "unhealthy";
    }

    // Environment variables check
    const requiredEnvVars = [
      "DATABASE_URL",
      "NEXTAUTH_URL",
      "NEXTAUTH_SECRET",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
    ];

    const missingEnvVars = requiredEnvVars.filter(
      (envVar) => !process.env[envVar],
    );

    checks.environment = {
      status: missingEnvVars.length === 0 ? "healthy" : "unhealthy",
      message:
        missingEnvVars.length === 0
          ? "All required environment variables present"
          : `Missing environment variables: ${missingEnvVars.join(", ")}`,
      missingVariables: missingEnvVars.length > 0 ? missingEnvVars : undefined,
    };

    if (missingEnvVars.length > 0) {
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

      // Alert if heap usage is over 80% of total
      const heapUsagePercent =
        (memUsageMB.heapUsed / memUsageMB.heapTotal) * 100;

      checks.memory = {
        status: heapUsagePercent > 80 ? "warning" : "healthy",
        usage: memUsageMB,
        heapUsagePercent: Math.round(heapUsagePercent),
        message:
          heapUsagePercent > 80
            ? "High memory usage detected"
            : "Memory usage within normal limits",
      };

      if (heapUsagePercent > 90) {
        overallStatus = "unhealthy";
      }
    }

    // System info
    const systemInfo = {
      nodeVersion: process.version,
      platform: process.platform,
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
