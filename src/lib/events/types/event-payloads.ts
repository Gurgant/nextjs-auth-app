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
 * Authentication-related event payloads
 */
export interface AuthEventPayload extends BaseEventPayload {
  email?: string;
  provider?: string;
  action: "login" | "logout" | "register" | "verify" | "2fa" | "password_reset";
  success?: boolean;
  errorCode?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * User management event payloads
 */
export interface UserEventPayload extends BaseEventPayload {
  userId: string;
  action: "created" | "updated" | "deleted" | "role_changed" | "status_changed";
  data?: Record<string, unknown>;
  previousData?: Record<string, unknown>;
}

/**
 * Security event payloads
 */
export interface SecurityEventPayload extends BaseEventPayload {
  eventType:
    | "suspicious_activity"
    | "rate_limit_exceeded"
    | "unauthorized_access"
    | "security_violation";
  severity: "low" | "medium" | "high" | "critical";
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  endpoint?: string;
}

/**
 * Application event payloads
 */
export interface AppEventPayload extends BaseEventPayload {
  action: string;
  resource?: string;
  data?: Record<string, unknown>;
}

/**
 * Audit event payloads
 */
export interface AuditEventPayload extends BaseEventPayload {
  action: string;
  resource: string;
  resourceId?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Union type for all event payloads
 */
export type EventPayload =
  | AuthEventPayload
  | UserEventPayload
  | SecurityEventPayload
  | AppEventPayload
  | AuditEventPayload
  | BaseEventPayload;

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

/**
 * Type-safe payload creator with validation
 */
export function createEventPayload<T extends BaseEventPayload>(
  payload: T,
): T & BaseEventPayload {
  return {
    timestamp: new Date(),
    ...payload,
  };
}
