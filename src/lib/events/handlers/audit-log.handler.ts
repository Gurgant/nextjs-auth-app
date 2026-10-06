import { IEventHandler, IEvent } from "../base/event.interface";
import {
  UserRegisteredEvent,
  PasswordChangedEvent,
} from "../domain/auth.events";
import {
  CommandExecutedEvent,
  CommandFailedEvent,
  ErrorOccurredEvent,
} from "../domain/system.events";

// Union type for all possible audit log severity levels
type AuditSeverity =
  | "info"
  | "warning"
  | "error"
  | "critical"
  | "low"
  | "medium"
  | "high";

// An entry keeps ids, outcomes and fixed labels: no e-mail address, no name,
// no text a client can choose (IP address, user agent) and no free-text error
// message.
interface AuditLogEntry {
  id: string;
  timestamp: Date;
  eventType: string;
  eventId: string;
  userId?: string;
  action: string;
  details: Record<string, unknown>;
  severity: AuditSeverity;
}

export class AuditLogHandler implements IEventHandler {
  readonly eventType = "*"; // Listen to all events
  readonly handlerName = "AuditLogHandler";

  private auditLogs: AuditLogEntry[] = [];
  private maxLogs: number;

  constructor(maxLogs: number = 10000) {
    this.maxLogs = maxLogs;
  }

  async handle(event: IEvent): Promise<void> {
    const auditEntry = this.createAuditEntry(event);
    if (auditEntry) {
      await this.saveAuditLog(auditEntry);
    }
  }

  private createAuditEntry(event: IEvent): AuditLogEntry | null {
    const baseEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: event.metadata.timestamp,
      eventType: event.type,
      eventId: event.metadata.eventId,
      userId: event.metadata.userId,
    };

    // Map specific events to audit entries
    switch (event.type) {
      case "user.registered":
        const regEvent = event as UserRegisteredEvent;
        return {
          ...baseEntry,
          action: "User Registration",
          details: {
            provider: regEvent.payload.provider,
          },
          severity: "info",
        };

      case "user.password_changed":
        return {
          ...baseEntry,
          action: "Password Changed",
          details: {
            requiresLogout: (event as PasswordChangedEvent).payload
              .requiresLogout,
          },
          severity: "warning",
        };

      case "system.command_executed":
        const cmdEvent = event as CommandExecutedEvent;
        return {
          ...baseEntry,
          action: `Command: ${cmdEvent.payload.commandName}`,
          details: {
            success: cmdEvent.payload.success,
            duration: cmdEvent.payload.duration,
          },
          severity: "info",
        };

      case "system.command_failed":
        // The error text is free text: the entry names the command only.
        const cmdFailed = event as CommandFailedEvent;
        return {
          ...baseEntry,
          action: `Command Failed: ${cmdFailed.payload.commandName}`,
          details: {},
          severity: "error",
        };

      case "system.error_occurred":
        // Type and code only: the message and the context can hold the
        // input, such as the address of a refused registration.
        const error = event as ErrorOccurredEvent;
        const code = error.payload.context?.code;
        return {
          ...baseEntry,
          action: "System Error",
          details: {
            errorType: error.payload.errorType,
            code: typeof code === "string" ? code : undefined,
          },
          severity: error.payload.severity,
        };

      default:
        // Any other event: its type only, none of its data
        return {
          ...baseEntry,
          action: event.type,
          details: {},
          severity: "info",
        };
    }
  }

  private async saveAuditLog(entry: AuditLogEntry): Promise<void> {
    this.auditLogs.push(entry);

    // Maintain max size
    if (this.auditLogs.length > this.maxLogs) {
      this.auditLogs.shift();
    }

    // Log critical events
    if (entry.severity === "critical" || entry.severity === "error") {
      console.error(
        `[AUDIT] ${entry.severity.toUpperCase()}: ${entry.action}`,
        {
          userId: entry.userId,
          details: entry.details,
          timestamp: entry.timestamp,
        },
      );
    } else if (process.env.NODE_ENV === "development") {
      console.log(`[AUDIT] ${entry.action}`, {
        userId: entry.userId,
        severity: entry.severity,
      });
    }

    // In production, you would persist to database here
    // await prisma.auditLog.create({ data: entry })
  }

  /**
   * Get audit logs
   */
  getAuditLogs(filters?: {
    userId?: string;
    severity?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): AuditLogEntry[] {
    let logs = [...this.auditLogs];

    if (filters) {
      if (filters.userId) {
        logs = logs.filter((l) => l.userId === filters.userId);
      }
      if (filters.severity) {
        logs = logs.filter((l) => l.severity === filters.severity);
      }
      if (filters.startDate) {
        logs = logs.filter((l) => l.timestamp >= filters.startDate!);
      }
      if (filters.endDate) {
        logs = logs.filter((l) => l.timestamp <= filters.endDate!);
      }
      if (filters.limit) {
        logs = logs.slice(-filters.limit);
      }
    }

    return logs;
  }
}
