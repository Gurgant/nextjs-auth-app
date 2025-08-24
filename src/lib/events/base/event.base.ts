import { randomUUID } from "crypto";
import { IEvent, EventMetadata } from "./event.interface";

export abstract class BaseEvent<TPayload = any> implements IEvent<TPayload> {
  abstract readonly type: string;
  readonly payload: TPayload;

  readonly metadata: EventMetadata;

  constructor(payload: TPayload, metadata?: Partial<EventMetadata>) {
    this.payload = payload;
    this.metadata = {
      eventId: metadata?.eventId || randomUUID(),
      timestamp: metadata?.timestamp || new Date(),
      userId: metadata?.userId,
      correlationId: metadata?.correlationId || randomUUID(),
      causationId: metadata?.causationId,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      locale: metadata?.locale,
      version: metadata?.version || 1,
    };
  }

  /**
   * Create a new event with same correlation ID
   */
  correlate<T>(
    EventClass: new (
      payload: T,
      metadata?: Partial<EventMetadata>,
    ) => IEvent<T>,
    payload: T,
  ): IEvent<T> {
    return new EventClass(payload, {
      correlationId: this.metadata.correlationId,
      causationId: this.metadata.eventId,
      userId: this.metadata.userId,
      locale: this.metadata.locale,
    });
  }

  /**
   * Convert event to JSON
   */
  toJSON(): object {
    return {
      type: this.type,
      payload: this.payload,
      metadata: this.metadata,
    };
  }

  /**
   * Create event from JSON
   */
  static fromJSON<T extends BaseEvent>(
    data: any,
    EventClass: new (payload: any, metadata?: Partial<EventMetadata>) => T,
  ): T {
    return new EventClass(data.payload, data.metadata);
  }

  /**
   * Get event age in milliseconds
   */
  getAge(): number {
    return Date.now() - this.metadata.timestamp.getTime();
  }

  /**
   * Check if event is older than specified milliseconds
   */
  isOlderThan(milliseconds: number): boolean {
    return this.getAge() > milliseconds;
  }
}
