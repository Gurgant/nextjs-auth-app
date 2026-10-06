import { randomUUID } from "crypto";
import { IEvent, EventMetadata } from "./event.interface";

export abstract class BaseEvent<TPayload = unknown>
  implements IEvent<TPayload>
{
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
   * Convert event to JSON
   */
  toJSON(): object {
    return {
      type: this.type,
      payload: this.payload,
      metadata: this.metadata,
    };
  }
}
