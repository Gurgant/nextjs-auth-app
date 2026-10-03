import { EventBus } from "./base/event-bus";
import { AuditLogHandler } from "./handlers/audit-log.handler";
import { AnalyticsHandler } from "./handlers/analytics.handler";
import { IEventBus } from "./base/event.interface";

// Type definitions for better type safety
interface AuditLogFilter {
  userId?: string;
  severity?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

// Singleton instances
let eventBusInstance: IEventBus | null = null;
let auditHandlerInstance: AuditLogHandler | null = null;
let analyticsHandlerInstance: AnalyticsHandler | null = null;

export function getEventBus(): IEventBus {
  if (!eventBusInstance) {
    eventBusInstance = createEventBus();
  }
  return eventBusInstance;
}

function createEventBus(): IEventBus {
  const bus = new EventBus({
    enableLogging: process.env.NODE_ENV === "development",
    enableAsync: true,
    maxRetries: 3,
    retryDelay: 1000,
  });

  // Two example listeners. What they keep stays in the memory of this
  // process: it is lost at restart and not shared between instances.
  auditHandlerInstance = new AuditLogHandler();
  analyticsHandlerInstance = new AnalyticsHandler();

  // Subscribe handlers to the bus
  bus.subscribeHandler(auditHandlerInstance);
  bus.subscribeHandler(analyticsHandlerInstance);

  return bus;
}

// Export singleton instances
export const eventBus = getEventBus();

// Export handler instances for direct access
export function getAuditHandler(): AuditLogHandler {
  if (!auditHandlerInstance) {
    getEventBus(); // Initialize if needed
  }
  return auditHandlerInstance!;
}

export function getAnalyticsHandler(): AnalyticsHandler {
  if (!analyticsHandlerInstance) {
    getEventBus(); // Initialize if needed
  }
  return analyticsHandlerInstance!;
}

// Utility function to get analytics summary
export function getAnalyticsSummary() {
  return getAnalyticsHandler().getSummary();
}

// Utility function to get audit logs with type safety
export function getAuditLogs(filters?: AuditLogFilter) {
  return getAuditHandler().getAuditLogs(filters);
}
