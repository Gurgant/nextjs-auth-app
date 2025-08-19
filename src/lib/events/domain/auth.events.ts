import { BaseEvent } from '../base/event.base'
import { EventMetadata } from '../base/event.interface'

// Event payloads
export interface UserRegisteredPayload {
  userId: string
  email: string
  name?: string | null
  provider: string
  emailVerified: boolean
  registeredAt: Date
}

export interface UserLoggedInPayload {
  userId: string
  email: string
  method: 'credentials' | 'oauth'
  provider?: string
  ipAddress?: string
  userAgent?: string
  loginAt: Date
}

export interface UserLoggedOutPayload {
  userId: string
  sessionId?: string
  logoutAt: Date
}

export interface PasswordChangedPayload {
  userId: string
  changedAt: Date
  requiresLogout?: boolean
}

export interface PasswordResetRequestedPayload {
  userId: string
  email: string
  token: string
  expiresAt: Date
  requestedAt: Date
}

export interface PasswordResetCompletedPayload {
  userId: string
  resetAt: Date
}

export interface EmailVerificationSentPayload {
  userId: string
  email: string
  token: string
  sentAt: Date
}

export interface EmailVerifiedPayload {
  userId: string
  email: string
  verifiedAt: Date
}

export interface TwoFactorEnabledPayload {
  userId: string
  method: 'totp' | 'sms' | 'email'
  enabledAt: Date
}

export interface TwoFactorDisabledPayload {
  userId: string
  disabledAt: Date
}

// Event classes
export class UserRegisteredEvent extends BaseEvent<UserRegisteredPayload> {
  readonly type = 'user.registered'
  
  constructor(payload: UserRegisteredPayload, metadata?: Partial<EventMetadata>) {
    super(payload, metadata)
  }
}

export class UserLoggedInEvent extends BaseEvent<UserLoggedInPayload> {
  readonly type = 'user.logged_in'
  
  constructor(payload: UserLoggedInPayload, metadata?: Partial<EventMetadata>) {
    super(payload, metadata)
  }
}

export class UserLoggedOutEvent extends BaseEvent<UserLoggedOutPayload> {
  readonly type = 'user.logged_out'
  
  constructor(payload: UserLoggedOutPayload, metadata?: Partial<EventMetadata>) {
    super(payload, metadata)
  }
}

export class PasswordChangedEvent extends BaseEvent<PasswordChangedPayload> {
  readonly type = 'user.password_changed'
  
  constructor(payload: PasswordChangedPayload, metadata?: Partial<EventMetadata>) {
    super(payload, metadata)
  }
}

export class PasswordResetRequestedEvent extends BaseEvent<PasswordResetRequestedPayload> {
  readonly type = 'user.password_reset_requested'
  
  constructor(payload: PasswordResetRequestedPayload, metadata?: Partial<EventMetadata>) {
    super(payload, metadata)
  }
}

export class PasswordResetCompletedEvent extends BaseEvent<PasswordResetCompletedPayload> {
  readonly type = 'user.password_reset_completed'
  
  constructor(payload: PasswordResetCompletedPayload, metadata?: Partial<EventMetadata>) {
    super(payload, metadata)
  }
}

export class EmailVerificationSentEvent extends BaseEvent<EmailVerificationSentPayload> {
  readonly type = 'user.email_verification_sent'
  
  constructor(payload: EmailVerificationSentPayload, metadata?: Partial<EventMetadata>) {
    super(payload, metadata)
  }
}

export class EmailVerifiedEvent extends BaseEvent<EmailVerifiedPayload> {
  readonly type = 'user.email_verified'
  
  constructor(payload: EmailVerifiedPayload, metadata?: Partial<EventMetadata>) {
    super(payload, metadata)
  }
}

export class TwoFactorEnabledEvent extends BaseEvent<TwoFactorEnabledPayload> {
  readonly type = 'user.two_factor_enabled'
  
  constructor(payload: TwoFactorEnabledPayload, metadata?: Partial<EventMetadata>) {
    super(payload, metadata)
  }
}

export class TwoFactorDisabledEvent extends BaseEvent<TwoFactorDisabledPayload> {
  readonly type = 'user.two_factor_disabled'
  
  constructor(payload: TwoFactorDisabledPayload, metadata?: Partial<EventMetadata>) {
    super(payload, metadata)
  }
}

// Export all auth events
export const AuthEvents = {
  UserRegisteredEvent,
  UserLoggedInEvent,
  UserLoggedOutEvent,
  PasswordChangedEvent,
  PasswordResetRequestedEvent,
  PasswordResetCompletedEvent,
  EmailVerificationSentEvent,
  EmailVerifiedEvent,
  TwoFactorEnabledEvent,
  TwoFactorDisabledEvent
} as const