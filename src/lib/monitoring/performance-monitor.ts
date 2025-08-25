/**
 * Production Performance Monitoring System
 * Comprehensive monitoring for account page optimization results
 */

export interface PerformanceThresholds {
  pageLoadTime: number;
  apiResponseTime: number;
  componentRenderTime: number;
  memoryUsage: number;
  bundleSize: number;
}

export interface PerformanceAlert {
  type: "warning" | "error" | "critical";
  metric: string;
  value: number;
  threshold: number;
  timestamp: number;
  url: string;
  userId?: string;
}

export class ProductionPerformanceMonitor {
  private static instance: ProductionPerformanceMonitor;
  private alerts: PerformanceAlert[] = [];
  private readonly thresholds: PerformanceThresholds;

  constructor(thresholds: PerformanceThresholds) {
    this.thresholds = thresholds;
  }

  static getInstance(
    thresholds?: PerformanceThresholds,
  ): ProductionPerformanceMonitor {
    if (!ProductionPerformanceMonitor.instance) {
      const defaultThresholds: PerformanceThresholds = {
        pageLoadTime: 3000, // 3 seconds
        apiResponseTime: 500, // 500ms
        componentRenderTime: 100, // 100ms
        memoryUsage: 50 * 1024 * 1024, // 50MB
        bundleSize: 1024 * 1024, // 1MB
      };
      ProductionPerformanceMonitor.instance = new ProductionPerformanceMonitor(
        thresholds || defaultThresholds,
      );
    }
    return ProductionPerformanceMonitor.instance;
  }

  // Monitor account page specific metrics
  public monitorAccountPageLoad(
    loadTime: number,
    url: string,
    userId?: string,
  ): void {
    const alert = this.checkThreshold("pageLoadTime", loadTime, url, userId);
    if (alert) {
      this.addAlert(alert);
      this.sendAlert(alert);
    }

    this.logMetric("account_page_load", loadTime, url, userId);
  }

  // Monitor API endpoint performance
  public monitorApiResponse(
    endpoint: string,
    responseTime: number,
    url: string,
    userId?: string,
  ): void {
    const alert = this.checkThreshold(
      "apiResponseTime",
      responseTime,
      url,
      userId,
    );
    if (alert) {
      this.addAlert(alert);
      this.sendAlert(alert);
    }

    this.logMetric(`api_${endpoint}`, responseTime, url, userId);
  }

  // Monitor component rendering performance
  public monitorComponentRender(
    componentName: string,
    renderTime: number,
    url: string,
    userId?: string,
  ): void {
    const alert = this.checkThreshold(
      "componentRenderTime",
      renderTime,
      url,
      userId,
    );
    if (alert) {
      this.addAlert(alert);
      this.sendAlert(alert);
    }

    this.logMetric(`component_${componentName}`, renderTime, url, userId);
  }

  // Check if metric exceeds threshold
  private checkThreshold(
    metric: keyof PerformanceThresholds,
    value: number,
    url: string,
    userId?: string,
  ): PerformanceAlert | null {
    const threshold = this.thresholds[metric];

    if (value > threshold) {
      let type: "warning" | "error" | "critical" = "warning";

      if (value > threshold * 2) type = "error";
      if (value > threshold * 3) type = "critical";

      return {
        type,
        metric,
        value,
        threshold,
        timestamp: Date.now(),
        url,
        userId,
      };
    }

    return null;
  }

  // Add alert to internal storage
  private addAlert(alert: PerformanceAlert): void {
    this.alerts.push(alert);

    // Keep only last 1000 alerts
    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(-1000);
    }
  }

  // Send alert to monitoring service
  private async sendAlert(alert: PerformanceAlert): Promise<void> {
    console.warn(`🚨 Performance Alert [${alert.type.toUpperCase()}]:`, {
      metric: alert.metric,
      value: `${alert.value}ms`,
      threshold: `${alert.threshold}ms`,
      url: alert.url,
      userId: alert.userId || "anonymous",
    });

    // Send to external monitoring service in production
    if (process.env.NODE_ENV === "production") {
      try {
        await fetch("/api/monitoring/alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(alert),
        });
      } catch (error) {
        console.error("Failed to send performance alert:", error);
      }
    }
  }

  // Log metric for analytics
  private logMetric(
    metric: string,
    value: number,
    url: string,
    userId?: string,
  ): void {
    console.log(`📊 Performance Metric: ${metric}`, {
      value: `${value}ms`,
      url,
      userId: userId || "anonymous",
      timestamp: new Date().toISOString(),
    });
  }

  // Get performance summary
  public getPerformanceSummary(hours: number = 24): {
    alerts: PerformanceAlert[];
    metrics: Record<
      string,
      { avg: number; max: number; min: number; count: number }
    >;
  } {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const recentAlerts = this.alerts.filter(
      (alert) => alert.timestamp > cutoff,
    );

    return {
      alerts: recentAlerts,
      metrics: this.calculateMetricSummary(recentAlerts),
    };
  }

  // Calculate metric summaries
  private calculateMetricSummary(
    alerts: PerformanceAlert[],
  ): Record<string, { avg: number; max: number; min: number; count: number }> {
    const metrics: Record<string, number[]> = {};

    alerts.forEach((alert) => {
      if (!metrics[alert.metric]) {
        metrics[alert.metric] = [];
      }
      metrics[alert.metric].push(alert.value);
    });

    const summary: Record<
      string,
      { avg: number; max: number; min: number; count: number }
    > = {};

    Object.entries(metrics).forEach(([metric, values]) => {
      summary[metric] = {
        avg: Math.round(
          values.reduce((sum, val) => sum + val, 0) / values.length,
        ),
        max: Math.max(...values),
        min: Math.min(...values),
        count: values.length,
      };
    });

    return summary;
  }
}

// Initialize global performance monitor
export const performanceMonitor = ProductionPerformanceMonitor.getInstance();
