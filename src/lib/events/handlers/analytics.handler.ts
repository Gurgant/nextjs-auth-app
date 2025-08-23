import { IEventHandler, IEvent } from "../base/event.interface";
import {
  UserRegisteredEvent,
  UserLoggedInEvent,
  PasswordChangedEvent,
} from "../domain/auth.events";
import {
  LoginFailedEvent,
  RateLimitExceededEvent,
} from "../domain/security.events";
import {
  CommandExecutedEvent,
  PerformanceMetricEvent,
} from "../domain/system.events";

interface AnalyticsMetric {
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: Date;
}

export class AnalyticsHandler implements IEventHandler {
  readonly eventType = "*"; // Listen to all events
  readonly handlerName = "AnalyticsHandler";

  private metrics: AnalyticsMetric[] = [];
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();

  async handle(event: IEvent): Promise<void> {
    this.processEvent(event);
  }

  private processEvent(event: IEvent): void {
    switch (event.type) {
      case "user.registered":
        this.incrementCounter("users.registered");
        this.trackMetric("user_registration", 1, {
          provider: (event as UserRegisteredEvent).payload.provider,
        });
        break;

      case "user.logged_in":
        const loginEvent = event as UserLoggedInEvent;
        this.incrementCounter("users.logged_in");
        this.incrementCounter(`users.logged_in.${loginEvent.payload.method}`);
        this.trackMetric("user_login", 1, {
          method: loginEvent.payload.method,
          provider: loginEvent.payload.provider || "credentials",
        });
        break;

      case "user.password_changed":
        this.incrementCounter("users.password_changed");
        this.trackMetric("password_change", 1, {});
        break;

      case "security.login_failed":
        const failedLogin = event as LoginFailedEvent;
        this.incrementCounter("security.login_failed");
        this.incrementCounter(
          `security.login_failed.${failedLogin.payload.reason}`,
        );
        this.trackMetric("login_failure", 1, {
          reason: failedLogin.payload.reason,
        });
        break;

      case "security.rate_limit_exceeded":
        const rateLimit = event as RateLimitExceededEvent;
        this.incrementCounter("security.rate_limit_exceeded");
        this.trackMetric("rate_limit_exceeded", 1, {
          action: rateLimit.payload.action,
          limit: rateLimit.payload.limit.toString(),
        });
        break;

      case "system.command_executed":
        const cmdEvent = event as CommandExecutedEvent;
        this.incrementCounter("commands.executed");
        this.incrementCounter(`commands.${cmdEvent.payload.commandName}`);

        // Track command duration
        this.trackMetric("command_duration", cmdEvent.payload.duration, {
          command: cmdEvent.payload.commandName,
          success: cmdEvent.payload.success.toString(),
        });

        // Update average duration gauge
        this.updateGauge(
          `command.${cmdEvent.payload.commandName}.avg_duration`,
          this.calculateAverageDuration(
            cmdEvent.payload.commandName,
            cmdEvent.payload.duration,
          ),
        );
        break;

      case "system.performance_metric":
        const perfEvent = event as PerformanceMetricEvent;
        this.trackMetric(
          perfEvent.payload.metric,
          perfEvent.payload.value,
          perfEvent.payload.tags || {},
        );
        break;
    }
  }

  private incrementCounter(name: string): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + 1);
  }

  private updateGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  private trackMetric(
    name: string,
    value: number,
    tags: Record<string, string>,
  ): void {
    const metric: AnalyticsMetric = {
      name,
      value,
      tags,
      timestamp: new Date(),
    };

    this.metrics.push(metric);

    // Keep only last 10000 metrics
    if (this.metrics.length > 10000) {
      this.metrics.shift();
    }

    // In production, send to analytics service
    if (process.env.NODE_ENV === "production") {
      // this.sendToAnalyticsService(metric)
    }
  }

  private calculateAverageDuration(
    commandName: string,
    newDuration: number,
  ): number {
    const metrics = this.metrics.filter(
      (m) => m.name === "command_duration" && m.tags.command === commandName,
    );

    if (metrics.length === 0) return newDuration;

    const total = metrics.reduce((sum, m) => sum + m.value, 0) + newDuration;
    return total / (metrics.length + 1);
  }

  /**
   * Get analytics summary
   */
  getSummary() {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      recentMetrics: this.metrics.slice(-100),
      totals: {
        registrations: this.counters.get("users.registered") || 0,
        logins: this.counters.get("users.logged_in") || 0,
        failedLogins: this.counters.get("security.login_failed") || 0,
        commands: this.counters.get("commands.executed") || 0,
      },
    };
  }

  /**
   * Get metrics for a specific time range
   */
  getMetrics(startDate: Date, endDate: Date): AnalyticsMetric[] {
    return this.metrics.filter(
      (m) => m.timestamp >= startDate && m.timestamp <= endDate,
    );
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = [];
    this.counters.clear();
    this.gauges.clear();
  }
}
