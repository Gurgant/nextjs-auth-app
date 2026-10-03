export interface EventMetadata {
  eventId: string;
  timestamp: Date;
  userId?: string;
  correlationId?: string;
  causationId?: string;
  ipAddress?: string;
  userAgent?: string;
  locale?: string;
  version?: number;
}

export interface IEvent<TPayload = unknown> {
  readonly type: string;
  readonly payload: TPayload;
  readonly metadata: EventMetadata;
}

export interface IEventHandler<TEvent extends IEvent = IEvent> {
  readonly eventType: string;
  readonly handlerName: string;
  handle(event: TEvent): Promise<void> | void;
}

export interface EventSubscription {
  id: string;
  eventType: string;
  handler: IEventHandler;
  priority?: number;
}

export type EventCallback<T extends IEvent = IEvent> = (
  event: T,
) => Promise<void> | void;

export interface IEventBus {
  publish(event: IEvent): Promise<void>;
  publishMany(events: IEvent[]): Promise<void>;
  subscribe<T extends IEvent>(
    eventType: string,
    handler: EventCallback<T>,
  ): string;
  subscribeHandler(handler: IEventHandler): string;
  unsubscribe(subscriptionId: string): void;
  unsubscribeAll(eventType?: string): void;
  getSubscriptions(): EventSubscription[];
}
