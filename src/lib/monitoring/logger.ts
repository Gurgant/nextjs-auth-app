/**
 * Production-ready logging utility with structured logging support
 * Supports different log levels and optional external logging services
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  component?: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private isDevelopment: boolean;
  private minLogLevel: LogLevel;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === "development";
    this.minLogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      fatal: 4,
    };
    return levels[level] >= levels[this.minLogLevel];
  }

  private formatLogEntry(entry: LogEntry): string {
    if (this.isDevelopment) {
      // Pretty format for development
      const prefix = `[${entry.timestamp}] ${entry.level.toUpperCase()}`;
      const component = entry.component ? ` [${entry.component}]` : "";
      const user = entry.userId ? ` [User: ${entry.userId}]` : "";

      let message = `${prefix}${component}${user}: ${entry.message}`;

      if (entry.metadata && Object.keys(entry.metadata).length > 0) {
        message += `\n  Metadata: ${JSON.stringify(entry.metadata, null, 2)}`;
      }

      if (entry.error) {
        message += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
        if (entry.error.stack) {
          message += `\n  Stack: ${entry.error.stack}`;
        }
      }

      return message;
    } else {
      // JSON format for production (structured logging)
      return JSON.stringify(entry);
    }
  }

  private writeLog(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;

    const formattedEntry = this.formatLogEntry(entry);

    // Write to console with appropriate method
    switch (entry.level) {
      case "debug":
        console.debug(formattedEntry);
        break;
      case "info":
        console.info(formattedEntry);
        break;
      case "warn":
        console.warn(formattedEntry);
        break;
      case "error":
      case "fatal":
        console.error(formattedEntry);
        break;
    }

    // Send to external logging service in production
    if (!this.isDevelopment && ["error", "fatal"].includes(entry.level)) {
      this.sendToExternalLogging(entry).catch((err) => {
        console.error("Failed to send log to external service:", err);
      });
    }
  }

  private async sendToExternalLogging(entry: LogEntry): Promise<void> {
    // Implement external logging service integration here
    // Examples: Sentry, DataDog, LogRocket, etc.

    if (process.env.SENTRY_DSN) {
      // Example Sentry integration (would need @sentry/nextjs package)
      // Sentry.captureException(entry.error || new Error(entry.message), {
      //   level: entry.level as any,
      //   tags: {
      //     component: entry.component,
      //     userId: entry.userId
      //   },
      //   extra: entry.metadata
      // })
    }

    // Add other external logging services as needed
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    options: Partial<LogEntry> = {},
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...options,
    };
  }

  debug(message: string, options: Partial<LogEntry> = {}): void {
    this.writeLog(this.createLogEntry("debug", message, options));
  }

  info(message: string, options: Partial<LogEntry> = {}): void {
    this.writeLog(this.createLogEntry("info", message, options));
  }

  warn(message: string, options: Partial<LogEntry> = {}): void {
    this.writeLog(this.createLogEntry("warn", message, options));
  }

  error(message: string, error?: Error, options: Partial<LogEntry> = {}): void {
    const logEntry = this.createLogEntry("error", message, {
      ...options,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    });
    this.writeLog(logEntry);
  }

  fatal(message: string, error?: Error, options: Partial<LogEntry> = {}): void {
    const logEntry = this.createLogEntry("fatal", message, {
      ...options,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    });
    this.writeLog(logEntry);
  }

  // Security-specific logging
  security(
    event: string,
    details: Record<string, any>,
    options: Partial<LogEntry> = {},
  ): void {
    this.warn(`Security event: ${event}`, {
      ...options,
      component: "security",
      metadata: {
        event,
        ...details,
        ...options.metadata,
      },
    });
  }

  // Authentication-specific logging
  auth(
    event: string,
    userId?: string,
    details: Record<string, any> = {},
    options: Partial<LogEntry> = {},
  ): void {
    this.info(`Auth event: ${event}`, {
      ...options,
      component: "auth",
      userId,
      metadata: {
        event,
        ...details,
        ...options.metadata,
      },
    });
  }

  // Performance logging
  performance(
    operation: string,
    duration: number,
    options: Partial<LogEntry> = {},
  ): void {
    this.info(`Performance: ${operation}`, {
      ...options,
      component: "performance",
      metadata: {
        operation,
        duration,
        ...options.metadata,
      },
    });
  }
}

// Export singleton logger instance
export const logger = new Logger();

// Helper function for request-scoped logging
export function createRequestLogger(
  requestId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  return {
    debug: (message: string, options: Partial<LogEntry> = {}) =>
      logger.debug(message, { ...options, requestId, ipAddress, userAgent }),
    info: (message: string, options: Partial<LogEntry> = {}) =>
      logger.info(message, { ...options, requestId, ipAddress, userAgent }),
    warn: (message: string, options: Partial<LogEntry> = {}) =>
      logger.warn(message, { ...options, requestId, ipAddress, userAgent }),
    error: (message: string, error?: Error, options: Partial<LogEntry> = {}) =>
      logger.error(message, error, {
        ...options,
        requestId,
        ipAddress,
        userAgent,
      }),
    fatal: (message: string, error?: Error, options: Partial<LogEntry> = {}) =>
      logger.fatal(message, error, {
        ...options,
        requestId,
        ipAddress,
        userAgent,
      }),
    security: (
      event: string,
      details: Record<string, any>,
      options: Partial<LogEntry> = {},
    ) =>
      logger.security(event, details, {
        ...options,
        requestId,
        ipAddress,
        userAgent,
      }),
    auth: (
      event: string,
      userId?: string,
      details: Record<string, any> = {},
      options: Partial<LogEntry> = {},
    ) =>
      logger.auth(event, userId, details, {
        ...options,
        requestId,
        ipAddress,
        userAgent,
      }),
    performance: (
      operation: string,
      duration: number,
      options: Partial<LogEntry> = {},
    ) =>
      logger.performance(operation, duration, {
        ...options,
        requestId,
        ipAddress,
        userAgent,
      }),
  };
}

// Performance measurement utility
export function measurePerformance<T>(
  operation: string,
  fn: () => Promise<T>,
  options: Partial<LogEntry> = {},
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      logger.performance(operation, duration, options);
      resolve(result);
    } catch (error) {
      const duration = Date.now() - start;
      logger.error(`Performance: ${operation} failed`, error as Error, {
        ...options,
        metadata: { operation, duration, ...options.metadata },
      });
      reject(error);
    }
  });
}
