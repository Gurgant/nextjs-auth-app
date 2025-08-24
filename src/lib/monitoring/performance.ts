/**
 * Performance monitoring utilities for tracking application metrics
 * Measures execution time, memory usage, and database query performance
 */

import { logger } from "./logger";

export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: string;
  metadata?: Record<string, any>;
  memoryUsage?: {
    before: NodeJS.MemoryUsage;
    after: NodeJS.MemoryUsage;
    delta: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
    };
  };
}

export interface DatabaseQueryMetric {
  query: string;
  duration: number;
  timestamp: string;
  success: boolean;
  errorMessage?: string;
  rowCount?: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private dbMetrics: DatabaseQueryMetric[] = [];
  private readonly maxMetrics = 1000; // Keep last 1000 metrics in memory
  private readonly slowQueryThreshold = 1000; // 1 second
  private readonly memoryLeakThreshold = 50 * 1024 * 1024; // 50MB

  /**
   * Measure execution time of a function
   */
  async measure<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>,
  ): Promise<T> {
    const start = Date.now();
    const memBefore = process.memoryUsage();

    try {
      const result = await fn();
      const duration = Date.now() - start;
      const memAfter = process.memoryUsage();

      const metric: PerformanceMetric = {
        name,
        duration,
        timestamp: new Date().toISOString(),
        metadata,
        memoryUsage: {
          before: memBefore,
          after: memAfter,
          delta: {
            rss: memAfter.rss - memBefore.rss,
            heapTotal: memAfter.heapTotal - memBefore.heapTotal,
            heapUsed: memAfter.heapUsed - memBefore.heapUsed,
            external: memAfter.external - memBefore.external,
          },
        },
      };

      this.addMetric(metric);

      // Log slow operations
      if (duration > this.slowQueryThreshold) {
        logger.warn(`Slow operation detected: ${name}`, {
          component: "performance",
          metadata: {
            duration,
            operation: name,
            ...metadata,
          },
        });
      }

      // Log potential memory leaks
      if (
        metric.memoryUsage &&
        metric.memoryUsage.delta.heapUsed > this.memoryLeakThreshold
      ) {
        logger.warn(`Large memory increase detected: ${name}`, {
          component: "performance",
          metadata: {
            memoryIncrease: metric.memoryUsage?.delta.heapUsed,
            operation: name,
            ...metadata,
          },
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      const memAfter = process.memoryUsage();

      const metric: PerformanceMetric = {
        name,
        duration,
        timestamp: new Date().toISOString(),
        metadata: { ...metadata, error: true },
        memoryUsage: {
          before: memBefore,
          after: memAfter,
          delta: {
            rss: memAfter.rss - memBefore.rss,
            heapTotal: memAfter.heapTotal - memBefore.heapTotal,
            heapUsed: memAfter.heapUsed - memBefore.heapUsed,
            external: memAfter.external - memBefore.external,
          },
        },
      };

      this.addMetric(metric);

      logger.error(`Operation failed: ${name}`, error as Error, {
        component: "performance",
        metadata: {
          duration,
          operation: name,
          ...metadata,
        },
      });

      throw error;
    }
  }

  /**
   * Measure synchronous function execution
   */
  measureSync<T>(name: string, fn: () => T, metadata?: Record<string, any>): T {
    const start = Date.now();
    const memBefore = process.memoryUsage();

    try {
      const result = fn();
      const duration = Date.now() - start;
      const memAfter = process.memoryUsage();

      const metric: PerformanceMetric = {
        name,
        duration,
        timestamp: new Date().toISOString(),
        metadata,
        memoryUsage: {
          before: memBefore,
          after: memAfter,
          delta: {
            rss: memAfter.rss - memBefore.rss,
            heapTotal: memAfter.heapTotal - memBefore.heapTotal,
            heapUsed: memAfter.heapUsed - memBefore.heapUsed,
            external: memAfter.external - memBefore.external,
          },
        },
      };

      this.addMetric(metric);

      if (duration > 100) {
        // 100ms threshold for sync operations
        logger.warn(`Slow sync operation: ${name}`, {
          component: "performance",
          metadata: { duration, operation: name, ...metadata },
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error(`Sync operation failed: ${name}`, error as Error, {
        component: "performance",
        metadata: { duration, operation: name, ...metadata },
      });
      throw error;
    }
  }

  /**
   * Record database query performance
   */
  recordDatabaseQuery(
    query: string,
    duration: number,
    success: boolean,
    errorMessage?: string,
    rowCount?: number,
  ): void {
    const metric: DatabaseQueryMetric = {
      query: this.sanitizeQuery(query),
      duration,
      timestamp: new Date().toISOString(),
      success,
      errorMessage,
      rowCount,
    };

    this.addDbMetric(metric);

    if (duration > this.slowQueryThreshold) {
      logger.warn(`Slow database query detected`, {
        component: "database",
        metadata: {
          duration,
          query: metric.query,
          success,
          rowCount,
        },
      });
    }

    if (!success) {
      logger.error(`Database query failed`, undefined, {
        component: "database",
        metadata: {
          duration,
          query: metric.query,
          error: errorMessage,
        },
      });
    }
  }

  /**
   * Get performance statistics
   */
  getStats(): {
    totalMetrics: number;
    avgDuration: number;
    slowOperations: number;
    memoryLeaks: number;
    errorRate: number;
    dbStats: {
      totalQueries: number;
      avgDuration: number;
      slowQueries: number;
      errorRate: number;
    };
  } {
    const totalMetrics = this.metrics.length;
    const avgDuration =
      totalMetrics > 0
        ? this.metrics.reduce((sum, m) => sum + m.duration, 0) / totalMetrics
        : 0;

    const slowOperations = this.metrics.filter(
      (m) => m.duration > this.slowQueryThreshold,
    ).length;
    const memoryLeaks = this.metrics.filter(
      (m) =>
        m.memoryUsage &&
        m.memoryUsage.delta.heapUsed > this.memoryLeakThreshold,
    ).length;
    const errors = this.metrics.filter((m) => m.metadata?.error).length;
    const errorRate = totalMetrics > 0 ? (errors / totalMetrics) * 100 : 0;

    // Database stats
    const totalDbQueries = this.dbMetrics.length;
    const avgDbDuration =
      totalDbQueries > 0
        ? this.dbMetrics.reduce((sum, m) => sum + m.duration, 0) /
          totalDbQueries
        : 0;
    const slowDbQueries = this.dbMetrics.filter(
      (m) => m.duration > this.slowQueryThreshold,
    ).length;
    const dbErrors = this.dbMetrics.filter((m) => !m.success).length;
    const dbErrorRate =
      totalDbQueries > 0 ? (dbErrors / totalDbQueries) * 100 : 0;

    return {
      totalMetrics,
      avgDuration: Math.round(avgDuration),
      slowOperations,
      memoryLeaks,
      errorRate: Math.round(errorRate * 100) / 100,
      dbStats: {
        totalQueries: totalDbQueries,
        avgDuration: Math.round(avgDbDuration),
        slowQueries: slowDbQueries,
        errorRate: Math.round(dbErrorRate * 100) / 100,
      },
    };
  }

  /**
   * Get recent slow operations
   */
  getSlowOperations(limit = 10): PerformanceMetric[] {
    return this.metrics
      .filter((m) => m.duration > this.slowQueryThreshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Get recent slow database queries
   */
  getSlowQueries(limit = 10): DatabaseQueryMetric[] {
    return this.dbMetrics
      .filter((m) => m.duration > this.slowQueryThreshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Clear old metrics to prevent memory leaks
   */
  clearOldMetrics(): void {
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
    if (this.dbMetrics.length > this.maxMetrics) {
      this.dbMetrics = this.dbMetrics.slice(-this.maxMetrics);
    }
  }

  private addMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }
  }

  private addDbMetric(metric: DatabaseQueryMetric): void {
    this.dbMetrics.push(metric);
    if (this.dbMetrics.length > this.maxMetrics) {
      this.dbMetrics.shift();
    }
  }

  private sanitizeQuery(query: string): string {
    // Remove sensitive data from queries for logging
    return query
      .replace(/('[^']*'|"[^"]*")/g, "***") // Replace string literals
      .replace(/\b\d+\b/g, "***") // Replace numbers
      .substring(0, 200) // Limit length
      .trim();
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Cleanup old metrics every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(
    () => {
      performanceMonitor.clearOldMetrics();
    },
    5 * 60 * 1000,
  );
}

// Utility functions
export const measureAsync = performanceMonitor.measure.bind(performanceMonitor);
export const measureSync =
  performanceMonitor.measureSync.bind(performanceMonitor);
export const recordDbQuery =
  performanceMonitor.recordDatabaseQuery.bind(performanceMonitor);
