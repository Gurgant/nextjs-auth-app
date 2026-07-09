import { BaseError } from "../base/base-error";
import { ErrorCode, ErrorSeverity } from "../base/error-codes";
import { ErrorFactory } from "../error-factory";

/**
 * Recovery strategy interface
 */
export interface IRecoveryStrategy<T = any> {
  canRecover(error: BaseError): boolean;
  recover(error: BaseError): Promise<T | undefined>;
}

/**
 * Recovery action result
 */
export interface RecoveryResult<T = any> {
  success: boolean;
  value?: T;
  error?: BaseError;
  strategy?: string;
}

/**
 * Base recovery strategy
 */
export abstract class BaseRecoveryStrategy<T = any>
  implements IRecoveryStrategy<T>
{
  constructor(
    protected readonly name: string,
    protected readonly maxAttempts: number = 3,
  ) {}

  abstract canRecover(error: BaseError): boolean;
  abstract recover(error: BaseError): Promise<T | undefined>;

  protected log(message: string, error?: BaseError): void {
    console.log(`[Recovery: ${this.name}] ${message}`, error?.code);
  }
}

/**
 * Retry recovery strategy for retryable errors
 */
export class RetryRecoveryStrategy<T> extends BaseRecoveryStrategy<T> {
  constructor(
    private readonly operation: () => Promise<T>,
    private readonly delay: number = 1000,
    private readonly backoff: number = 2,
  ) {
    super("Retry");
  }

  canRecover(error: BaseError): boolean {
    return error.isRetryable();
  }

  async recover(error: BaseError): Promise<T | undefined> {
    this.log("Attempting retry recovery", error);

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const waitTime = this.delay * Math.pow(this.backoff, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, waitTime));

        const result = await this.operation();
        this.log(`Recovery successful after ${attempt} attempts`);
        return result;
      } catch (retryError) {
        if (attempt === this.maxAttempts) {
          this.log("Max retry attempts reached");
          throw retryError;
        }
      }
    }

    return undefined;
  }
}

/**
 * Fallback recovery strategy
 */
export class FallbackRecoveryStrategy<T> extends BaseRecoveryStrategy<T> {
  constructor(
    private readonly fallbackValue: T | (() => Promise<T>),
    private readonly errorCodes?: ErrorCode[],
  ) {
    super("Fallback");
  }

  canRecover(error: BaseError): boolean {
    if (!this.errorCodes) return true;
    return this.errorCodes.includes(error.code);
  }

  async recover(error: BaseError): Promise<T | undefined> {
    this.log("Using fallback value", error);

    if (typeof this.fallbackValue === "function") {
      return await (this.fallbackValue as () => Promise<T>)();
    }

    return this.fallbackValue;
  }
}

/**
 * Cache recovery strategy - return cached value on error
 */
export class CacheRecoveryStrategy<T> extends BaseRecoveryStrategy<T> {
  private cache: Map<string, { value: T; timestamp: Date }> = new Map();

  constructor(
    private readonly getCacheKey: () => string,
    private readonly ttl: number = 60000, // 1 minute
  ) {
    super("Cache");
  }

  canRecover(error: BaseError): boolean {
    const key = this.getCacheKey();
    const cached = this.cache.get(key);

    if (!cached) return false;

    const age = Date.now() - cached.timestamp.getTime();
    return age < this.ttl;
  }

  async recover(error: BaseError): Promise<T | undefined> {
    const key = this.getCacheKey();
    const cached = this.cache.get(key);

    if (cached) {
      this.log("Returning cached value", error);
      return cached.value;
    }

    return undefined;
  }

  updateCache(value: T): void {
    const key = this.getCacheKey();
    this.cache.set(key, { value, timestamp: new Date() });
  }

  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * Circuit breaker recovery strategy
 */
export class CircuitBreakerRecoveryStrategy<T> extends BaseRecoveryStrategy<T> {
  private failures = 0;
  private lastFailureTime?: Date;
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";

  constructor(
    private readonly operation: () => Promise<T>,
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000,
    private readonly fallback?: T | (() => Promise<T>),
  ) {
    super("CircuitBreaker");
  }

  canRecover(error: BaseError): boolean {
    // Can always attempt recovery (might use fallback)
    return true;
  }

  async recover(error: BaseError): Promise<T | undefined> {
    // Check if circuit should be reset
    if (this.state === "OPEN" && this.shouldReset()) {
      this.state = "HALF_OPEN";
      this.failures = 0;
    }

    // If circuit is open, use fallback
    if (this.state === "OPEN") {
      if (this.fallback) {
        this.log("Circuit open, using fallback", error);
        if (typeof this.fallback === "function") {
          return await (this.fallback as () => Promise<T>)();
        }
        return this.fallback;
      }

      throw ErrorFactory.system.circuitBreakerOpen(
        "Service",
        this.failures,
        this.threshold,
        new Date(this.lastFailureTime!.getTime() + this.timeout),
      );
    }

    try {
      const result = await this.operation();

      // Success - reset circuit
      if (this.state === "HALF_OPEN") {
        this.state = "CLOSED";
        this.failures = 0;
        this.log("Circuit recovered");
      }

      return result;
    } catch (retryError) {
      this.failures++;
      this.lastFailureTime = new Date();

      // Open circuit if threshold exceeded
      if (this.failures >= this.threshold) {
        this.state = "OPEN";
        this.log("Circuit opened");
      }

      throw retryError;
    }
  }

  private shouldReset(): boolean {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime.getTime() > this.timeout;
  }
}

/**
 * Compensation recovery strategy - perform compensating action
 */
export class CompensationRecoveryStrategy<T> extends BaseRecoveryStrategy<T> {
  constructor(
    private readonly compensate: (error: BaseError) => Promise<T>,
    private readonly errorCodes?: ErrorCode[],
  ) {
    super("Compensation");
  }

  canRecover(error: BaseError): boolean {
    if (!this.errorCodes) return true;
    return this.errorCodes.includes(error.code);
  }

  async recover(error: BaseError): Promise<T | undefined> {
    this.log("Performing compensation", error);
    return await this.compensate(error);
  }
}

/**
 * Recovery manager - coordinates multiple recovery strategies
 */
export class RecoveryManager {
  private strategies: IRecoveryStrategy[] = [];

  /**
   * Add recovery strategy
   */
  addStrategy(strategy: IRecoveryStrategy): this {
    this.strategies.push(strategy);
    return this;
  }

  /**
   * Attempt recovery using registered strategies
   */
  async recover<T>(error: BaseError): Promise<RecoveryResult<T>> {
    const baseError = ErrorFactory.wrap(error);

    // Try each strategy in order
    for (const strategy of this.strategies) {
      if (strategy.canRecover(baseError)) {
        try {
          const value = await strategy.recover(baseError);
          return {
            success: true,
            value: value as T,
            strategy: strategy.constructor.name,
          };
        } catch (recoveryError) {
          // Continue to next strategy
          console.warn(
            `Recovery strategy ${strategy.constructor.name} failed:`,
            recoveryError,
          );
        }
      }
    }

    // No recovery possible
    return {
      success: false,
      error: baseError,
    };
  }

  /**
   * Clear all strategies
   */
  clear(): void {
    this.strategies = [];
  }
}

/**
 * Recovery decorator for methods
 */
export function Recoverable<T>(
  strategies: IRecoveryStrategy<T>[] | (() => IRecoveryStrategy<T>[]),
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        const manager = new RecoveryManager();
        const strategyList =
          typeof strategies === "function" ? strategies() : strategies;

        for (const strategy of strategyList) {
          manager.addStrategy(strategy);
        }

        const result = await manager.recover<T>(ErrorFactory.wrap(error));

        if (result.success) {
          return result.value;
        }

        throw result.error || error;
      }
    };

    return descriptor;
  };
}

/**
 * Common recovery patterns
 */
export class RecoveryPatterns {
  /**
   * Database operation with retry and fallback
   */
  static database<T>(
    operation: () => Promise<T>,
    fallback?: T,
  ): IRecoveryStrategy<T>[] {
    const strategies: IRecoveryStrategy<T>[] = [
      new RetryRecoveryStrategy(operation, 1000, 2),
    ];

    if (fallback !== undefined) {
      strategies.push(
        new FallbackRecoveryStrategy(fallback, [
          ErrorCode.DATABASE_ERROR,
          ErrorCode.TIMEOUT,
        ]),
      );
    }

    return strategies;
  }

  /**
   * External API call with circuit breaker
   */
  static externalApi<T>(
    operation: () => Promise<T>,
    fallback?: T | (() => Promise<T>),
  ): IRecoveryStrategy<T>[] {
    return [new CircuitBreakerRecoveryStrategy(operation, 5, 60000, fallback)];
  }

  /**
   * Cached operation
   */
  static cached<T>(
    getCacheKey: () => string,
    ttl: number = 60000,
  ): IRecoveryStrategy<T>[] {
    return [new CacheRecoveryStrategy(getCacheKey, ttl)];
  }

  /**
   * Critical operation with comprehensive recovery
   */
  static critical<T>(
    operation: () => Promise<T>,
    compensate: (error: BaseError) => Promise<T>,
    fallback?: T,
  ): IRecoveryStrategy<T>[] {
    const strategies: IRecoveryStrategy<T>[] = [
      new RetryRecoveryStrategy(operation, 2000, 2),
      new CompensationRecoveryStrategy(compensate),
    ];

    if (fallback !== undefined) {
      strategies.push(new FallbackRecoveryStrategy(fallback));
    }

    return strategies;
  }
}
