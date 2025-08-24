import { BaseEvent } from "../base/event.base";
import { EventMetadata } from "../base/event.interface";

// Security event payloads
export interface SuspiciousActivityPayload {
  userId?: string;
  activityType:
    | "multiple_failed_logins"
    | "unusual_location"
    | "brute_force"
    | "session_hijacking"
    | "invalid_token";
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  severity: "low" | "medium" | "high" | "critical";
  detectedAt: Date;
}

export interface LoginFailedPayload {
  email: string;
  reason:
    | "invalid_credentials"
    | "account_locked"
    | "account_disabled"
    | "email_not_verified";
  attemptNumber?: number;
  ipAddress?: string;
  userAgent?: string;
  failedAt: Date;
}

export interface AccountLockedPayload {
  userId: string;
  email: string;
  reason: "too_many_attempts" | "suspicious_activity" | "admin_action";
  lockedUntil?: Date;
  lockedAt: Date;
}

export interface AccountUnlockedPayload {
  userId: string;
  email: string;
  unlockedBy?: string;
  unlockedAt: Date;
}

export interface RateLimitExceededPayload {
  identifier: string; // Could be IP, userId, email
  action: string;
  limit: number;
  window: number; // in seconds
  attemptCount: number;
  exceededAt: Date;
}

export interface UnauthorizedAccessPayload {
  userId?: string;
  resource: string;
  action: string;
  ipAddress?: string;
  userAgent?: string;
  attemptedAt: Date;
}

export interface SecurityAlertPayload {
  alertType: string;
  severity: "info" | "warning" | "error" | "critical";
  message: string;
  details?: Record<string, any>;
  affectedUsers?: string[];
  alertedAt: Date;
}

// Security event classes
export class SuspiciousActivityEvent extends BaseEvent<SuspiciousActivityPayload> {
  readonly type = "security.suspicious_activity";

  constructor(
    payload: SuspiciousActivityPayload,
    metadata?: Partial<EventMetadata>,
  ) {
    super(payload, metadata);
  }
}

export class LoginFailedEvent extends BaseEvent<LoginFailedPayload> {
  readonly type = "security.login_failed";

  constructor(payload: LoginFailedPayload, metadata?: Partial<EventMetadata>) {
    super(payload, metadata);
  }
}

export class AccountLockedEvent extends BaseEvent<AccountLockedPayload> {
  readonly type = "security.account_locked";

  constructor(
    payload: AccountLockedPayload,
    metadata?: Partial<EventMetadata>,
  ) {
    super(payload, metadata);
  }
}

export class AccountUnlockedEvent extends BaseEvent<AccountUnlockedPayload> {
  readonly type = "security.account_unlocked";

  constructor(
    payload: AccountUnlockedPayload,
    metadata?: Partial<EventMetadata>,
  ) {
    super(payload, metadata);
  }
}

export class RateLimitExceededEvent extends BaseEvent<RateLimitExceededPayload> {
  readonly type = "security.rate_limit_exceeded";

  constructor(
    payload: RateLimitExceededPayload,
    metadata?: Partial<EventMetadata>,
  ) {
    super(payload, metadata);
  }
}

export class UnauthorizedAccessEvent extends BaseEvent<UnauthorizedAccessPayload> {
  readonly type = "security.unauthorized_access";

  constructor(
    payload: UnauthorizedAccessPayload,
    metadata?: Partial<EventMetadata>,
  ) {
    super(payload, metadata);
  }
}

export class SecurityAlertEvent extends BaseEvent<SecurityAlertPayload> {
  readonly type = "security.alert";

  constructor(
    payload: SecurityAlertPayload,
    metadata?: Partial<EventMetadata>,
  ) {
    super(payload, metadata);
  }
}

// Export all security events
export const SecurityEvents = {
  SuspiciousActivityEvent,
  LoginFailedEvent,
  AccountLockedEvent,
  AccountUnlockedEvent,
  RateLimitExceededEvent,
  UnauthorizedAccessEvent,
  SecurityAlertEvent,
} as const;
