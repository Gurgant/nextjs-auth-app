import { randomUUID } from "crypto";
import { IEvent, EventMetadata } from "./event.interface";
import { isValidEventPayload } from "../types/event-payloads";

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
   * Create event from JSON with improved validation
   * Validates basic structure but maintains backward compatibility
   */
  static fromJSON<T extends BaseEvent>(
    data: unknown,
    EventClass: new (payload: any, metadata?: Partial<EventMetadata>) => T,
  ): T {
    // Basic validation to ensure data has expected structure
    if (!data || typeof data !== "object") {
      throw new Error("Invalid event data: must be an object");
    }

    const eventData = data as Record<string, any>;

    // Validate that payload exists
    if (!("payload" in eventData)) {
      throw new Error("Invalid event data: missing payload");
    }

    // Optional payload validation if it extends BaseEventPayload
    if (isValidEventPayload(eventData.payload)) {
      // Payload follows our base structure - could add more validation here
    }

    return new EventClass(eventData.payload, eventData.metadata);
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
