import { EventBus } from "./base/event-bus";
import { InMemoryEventStore } from "./store/in-memory-event-store";
import { AuditLogHandler } from "./handlers/audit-log.handler";
import { AnalyticsHandler } from "./handlers/analytics.handler";
import { NotificationHandler } from "./handlers/notification.handler";
import { IEventBus, IEventStore } from "./base/event.interface";

// Singleton instances
let eventBusInstance: IEventBus | null = null;
let eventStoreInstance: IEventStore | null = null;
let auditHandlerInstance: AuditLogHandler | null = null;
let analyticsHandlerInstance: AnalyticsHandler | null = null;
let notificationHandlerInstance: NotificationHandler | null = null;

export function getEventBus(): IEventBus {
  if (!eventBusInstance) {
    eventBusInstance = createEventBus();
  }
  return eventBusInstance;
}

export function getEventStore(): IEventStore {
  if (!eventStoreInstance) {
    eventStoreInstance = new InMemoryEventStore(10000);
  }
  return eventStoreInstance;
}

function createEventBus(): IEventBus {
  const bus = new EventBus({
    enableLogging: process.env.NODE_ENV === "development",
    enableAsync: true,
    maxRetries: 3,
    retryDelay: 1000,
  });

  // Create and register handlers
  auditHandlerInstance = new AuditLogHandler();
  analyticsHandlerInstance = new AnalyticsHandler();
  notificationHandlerInstance = new NotificationHandler();

  // Subscribe handlers to the bus
  bus.subscribeHandler(auditHandlerInstance);
  bus.subscribeHandler(analyticsHandlerInstance);
  bus.subscribeHandler(notificationHandlerInstance);

  // Subscribe event store
  const store = getEventStore();
  bus.subscribe("*", async (event) => {
    await store.append(event);
  });

  return bus;
}

// Export singleton instances
export const eventBus = getEventBus();
export const eventStore = getEventStore();

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

export function getNotificationHandler(): NotificationHandler {
  if (!notificationHandlerInstance) {
    getEventBus(); // Initialize if needed
  }
  return notificationHandlerInstance!;
}

// Utility function to emit events easily
export async function emitEvent(event: any): Promise<void> {
  await eventBus.publish(event);
}

// Utility function to get event history
export async function getEventHistory(filters?: any): Promise<any[]> {
  return await eventStore.getEvents(filters);
}

// Utility function to get analytics summary
export function getAnalyticsSummary() {
  return getAnalyticsHandler().getSummary();
}

// Utility function to get audit logs
export function getAuditLogs(filters?: any) {
  return getAuditHandler().getAuditLogs(filters);
}

// Utility function to process notification queue
export async function processNotificationQueue(): Promise<void> {
  await getNotificationHandler().processEmailQueue();
}
