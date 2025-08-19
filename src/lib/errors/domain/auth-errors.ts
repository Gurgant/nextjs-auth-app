import { BaseError, ErrorContext } from '../base/base-error'
import { ErrorCode } from '../base/error-codes'

/**
 * Authentication error - thrown when authentication fails
 */
export class AuthenticationError extends BaseError {
  constructor(
    message: string = 'Authentication failed',
    details?: any,
    context?: ErrorContext
  ) {
    super(ErrorCode.AUTHENTICATION_FAILED, message, details, context)
  }
}

/**
 * Invalid credentials error
 */
export class InvalidCredentialsError extends BaseError {
  constructor(
    message: string = 'Invalid email or password',
    context?: ErrorContext
  ) {
    super(ErrorCode.INVALID_CREDENTIALS, message, undefined, context)
  }
}

/**
 * Session expired error
 */
export class SessionExpiredError extends BaseError {
  constructor(
    message: string = 'Your session has expired',
    context?: ErrorContext
  ) {
    super(ErrorCode.SESSION_EXPIRED, message, undefined, context)
  }
}

/**
 * Account locked error
 */
export class AccountLockedError extends BaseError {
  constructor(
    reason: string,
    lockedUntil?: Date,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.ACCOUNT_LOCKED,
      'Your account has been locked',
      { reason, lockedUntil },
      context
    )
  }
}

/**
 * Account disabled error
 */
export class AccountDisabledError extends BaseError {
  constructor(
    reason?: string,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.ACCOUNT_DISABLED,
      'Your account has been disabled',
      { reason },
      context
    )
  }
}

/**
 * Email not verified error
 */
export class EmailNotVerifiedError extends BaseError {
  constructor(
    email: string,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.EMAIL_NOT_VERIFIED,
      'Please verify your email address to continue',
      { email },
      context
    )
  }
}

/**
 * Two-factor authentication required error
 */
export class TwoFactorRequiredError extends BaseError {
  constructor(
    method: 'totp' | 'sms' | 'email',
    context?: ErrorContext
  ) {
    super(
      ErrorCode.TWO_FACTOR_REQUIRED,
      'Two-factor authentication is required',
      { method },
      context
    )
  }
}

/**
 * Two-factor authentication failed error
 */
export class TwoFactorFailedError extends BaseError {
  constructor(
    attemptsRemaining?: number,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.TWO_FACTOR_FAILED,
      'Invalid two-factor authentication code',
      { attemptsRemaining },
      context
    )
  }
}

/**
 * Authorization error - thrown when user lacks permissions
 */
export class AuthorizationError extends BaseError {
  constructor(
    message: string = 'You are not authorized to perform this action',
    resource?: string,
    action?: string,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.FORBIDDEN,
      message,
      { resource, action },
      context
    )
  }
}

/**
 * Insufficient permissions error
 */
export class InsufficientPermissionsError extends BaseError {
  constructor(
    requiredPermissions: string[],
    userPermissions?: string[],
    context?: ErrorContext
  ) {
    super(
      ErrorCode.INSUFFICIENT_PERMISSIONS,
      'Insufficient permissions to perform this action',
      { requiredPermissions, userPermissions },
      context
    )
  }
}

/**
 * Resource access denied error
 */
export class ResourceAccessDeniedError extends BaseError {
  constructor(
    resource: string,
    resourceId?: string,
    context?: ErrorContext
  ) {
    super(
      ErrorCode.RESOURCE_ACCESS_DENIED,
      `Access denied to ${resource}`,
      { resource, resourceId },
      context
    )
  }
}