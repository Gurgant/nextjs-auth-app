import { ErrorContext } from "./base/base-error";
import { ErrorFactory } from "./error-factory";
import type { ErrorDetails } from "./types/error-details";
import { z } from "zod";

/**
 * Fluent builder for creating errors with context
 */
export class ErrorBuilder {
  private context: ErrorContext = {};

  /**
   * Set user ID in error context
   */
  withUserId(userId: string): this {
    this.context.userId = userId;
    return this;
  }

  /**
   * Set request ID in error context
   */
  withRequestId(requestId: string): this {
    this.context.requestId = requestId;
    return this;
  }

  /**
   * Set correlation ID in error context
   */
  withCorrelationId(correlationId: string): this {
    this.context.correlationId = correlationId;
    return this;
  }

  /**
   * Set request path in error context
   */
  withPath(path: string): this {
    this.context.path = path;
    return this;
  }

  /**
   * Set HTTP method in error context
   */
  withMethod(method: string): this {
    this.context.method = method;
    return this;
  }

  /**
   * Build authentication error
   */
  auth = {
    invalidCredentials: () =>
      ErrorFactory.auth.invalidCredentials(this.context),

    sessionExpired: () => ErrorFactory.auth.sessionExpired(this.context),

    accountLocked: (reason: string, lockedUntil?: Date) =>
      ErrorFactory.auth.accountLocked(reason, lockedUntil, this.context),

    accountDisabled: (reason?: string) =>
      ErrorFactory.auth.accountDisabled(reason, this.context),

    emailNotVerified: (email: string) =>
      ErrorFactory.auth.emailNotVerified(email, this.context),

    twoFactorRequired: (method: "totp" | "sms" | "email") =>
      ErrorFactory.auth.twoFactorRequired(method, this.context),

    twoFactorFailed: (attemptsRemaining?: number) =>
      ErrorFactory.auth.twoFactorFailed(attemptsRemaining, this.context),

    unauthorized: (resource?: string, action?: string) =>
      ErrorFactory.auth.unauthorized(resource, action, this.context),

    insufficientPermissions: (required: string[], userPerms?: string[]) =>
      ErrorFactory.auth.insufficientPermissions(
        required,
        userPerms,
        this.context,
      ),

    resourceAccessDenied: (resource: string, resourceId?: string) =>
      ErrorFactory.auth.resourceAccessDenied(
        resource,
        resourceId,
        this.context,
      ),
  };

  /**
   * Build validation error
   */
  validation = {
    failed: (message?: string, errors?: Record<string, string | string[]>) =>
      ErrorFactory.validation.failed(message, errors, this.context),

    fromZod: (zodError: z.ZodError) =>
      ErrorFactory.validation.fromZod(zodError, this.context),

    invalidInput: (field: string, value?: unknown, expectedType?: string) =>
      ErrorFactory.validation.invalidInput(
        field,
        value,
        expectedType,
        this.context,
      ),

    missingField: (field: string | string[]) =>
      ErrorFactory.validation.missingField(field, this.context),

    invalidFormat: (
      field: string,
      expectedFormat: string,
      actualValue?: string,
    ) =>
      ErrorFactory.validation.invalidFormat(
        field,
        expectedFormat,
        actualValue,
        this.context,
      ),

    outOfRange: (
      field: string,
      min?: number | Date,
      max?: number | Date,
      actualValue?: number | Date,
    ) =>
      ErrorFactory.validation.outOfRange(
        field,
        min,
        max,
        actualValue,
        this.context,
      ),
  };

  /**
   * Build business error
   */
  business = {
    ruleViolation: (rule: string, message: string, details?: ErrorDetails) =>
      ErrorFactory.business.ruleViolation(rule, message, details, this.context),

    operationNotAllowed: (operation: string, reason: string) =>
      ErrorFactory.business.operationNotAllowed(
        operation,
        reason,
        this.context,
      ),

    notFound: (resourceType: string, resourceId?: string | number) =>
      ErrorFactory.business.notFound(resourceType, resourceId, this.context),

    alreadyExists: (
      resourceType: string,
      identifier: Record<string, unknown>,
    ) =>
      ErrorFactory.business.alreadyExists(
        resourceType,
        identifier,
        this.context,
      ),

    concurrentModification: (
      resourceType: string,
      resourceId: string | number,
      expectedVersion?: number,
      actualVersion?: number,
    ) =>
      ErrorFactory.business.concurrentModification(
        resourceType,
        resourceId,
        expectedVersion,
        actualVersion,
        this.context,
      ),

    quotaExceeded: (
      quotaType: string,
      limit: number,
      current: number,
      resetAt?: Date,
    ) =>
      ErrorFactory.business.quotaExceeded(
        quotaType,
        limit,
        current,
        resetAt,
        this.context,
      ),

    invalidStateTransition: (
      entityType: string,
      currentState: string,
      attemptedState: string,
      allowedStates?: string[],
    ) =>
      ErrorFactory.business.invalidStateTransition(
        entityType,
        currentState,
        attemptedState,
        allowedStates,
        this.context,
      ),
  };

  /**
   * Build system error
   */
  system = {
    internal: (message?: string, cause?: Error) =>
      ErrorFactory.system.internal(message, cause, this.context),

    unavailable: (
      service: string,
      reason?: string,
      estimatedDowntime?: number,
    ) =>
      ErrorFactory.system.unavailable(
        service,
        reason,
        estimatedDowntime,
        this.context,
      ),

    database: (operation: string, message: string, cause?: Error) =>
      ErrorFactory.system.database(operation, message, cause, this.context),

    network: (
      url: string,
      method: string,
      statusCode?: number,
      cause?: Error,
    ) =>
      ErrorFactory.system.network(url, method, statusCode, cause, this.context),

    timeout: (operation: string, timeoutMs: number) =>
      ErrorFactory.system.timeout(operation, timeoutMs, this.context),

    configuration: (configKey: string, reason: string) =>
      ErrorFactory.system.configuration(configKey, reason, this.context),

    rateLimit: (limit: number, window: string, resetAt?: Date) =>
      ErrorFactory.system.rateLimit(limit, window, resetAt, this.context),
  };
}

/**
 * Create a new error builder
 */
export function createError(): ErrorBuilder {
  return new ErrorBuilder();
}
