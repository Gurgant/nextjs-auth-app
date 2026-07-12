/**
 * Base event payload types for type-safe event handling
 */

/**
 * Base interface for all event payloads
 */
export interface BaseEventPayload {
  timestamp?: Date;
  correlationId?: string;
  userId?: string;
}

/**
 * Type guard to check if payload extends BaseEventPayload
 */
export function isValidEventPayload(
  payload: unknown,
): payload is BaseEventPayload {
  return (
    (payload !== null &&
      typeof payload === "object" &&
      (payload as BaseEventPayload).timestamp instanceof Date === false) ||
    (payload as BaseEventPayload).timestamp === undefined ||
    (payload as BaseEventPayload).timestamp instanceof Date
  );
}
