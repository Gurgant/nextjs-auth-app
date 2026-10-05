import { IEventHandler, IEvent } from "../base/event.interface";
import { UserRegisteredEvent } from "../domain/auth.events";
import { CommandExecutedEvent } from "../domain/system.events";

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

      case "user.password_changed":
        this.incrementCounter("users.password_changed");
        this.trackMetric("password_change", 1, {});
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
          this.calculateAverageDuration(cmdEvent.payload.commandName),
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

  // The newest duration is already among the metrics (trackMetric runs
  // first), so it is counted once.
  private calculateAverageDuration(commandName: string): number {
    const metrics = this.metrics.filter(
      (m) => m.name === "command_duration" && m.tags.command === commandName,
    );

    if (metrics.length === 0) return 0;

    const total = metrics.reduce((sum, m) => sum + m.value, 0);
    return total / metrics.length;
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
        commands: this.counters.get("commands.executed") || 0,
      },
    };
  }

  /**
   * Get metrics for a specific time range. Called by a test only: the
   * summary hands out the newest 100 metrics, so the limit of the store is
   * read here (src/lib/events/__tests__/event-provider.test.ts).
   */
  getMetrics(startDate: Date, endDate: Date): AnalyticsMetric[] {
    return this.metrics.filter(
      (m) => m.timestamp >= startDate && m.timestamp <= endDate,
    );
  }
}
