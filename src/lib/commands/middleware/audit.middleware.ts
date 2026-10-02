import { ICommandMiddleware } from "./middleware.interface";
import { CommandMetadata } from "../base/command.interface";
import { sanitizeCommandInput, sanitizeCommandOutput } from "../base/sanitize";

/** Entries kept in memory; older ones are dropped first. */
export const DEFAULT_MAX_AUDIT_LOGS = 1000;

interface AuditLog {
  commandName: string;
  commandId: string;
  userId?: string;
  input: unknown;
  output?: unknown;
  error?: string;
  duration?: number;
  metadata: CommandMetadata;
  timestamp: Date;
}

export class AuditMiddleware implements ICommandMiddleware {
  name = "AuditMiddleware";

  private auditLogs: AuditLog[] = [];
  private persistToDatabase: boolean;
  private maxLogs: number;

  constructor(
    persistToDatabase: boolean = false,
    maxLogs: number = DEFAULT_MAX_AUDIT_LOGS,
  ) {
    this.persistToDatabase = persistToDatabase;
    this.maxLogs = maxLogs;
  }

  async after(
    commandName: string,
    input: unknown,
    output: unknown,
    metadata: CommandMetadata,
    duration: number,
  ): Promise<void> {
    const auditLog: AuditLog = {
      commandName,
      commandId: metadata.commandId,
      userId: metadata.userId,
      input: sanitizeCommandInput(input),
      output: sanitizeCommandOutput(output),
      duration,
      metadata,
      timestamp: new Date(),
    };

    await this.saveAuditLog(auditLog);
  }

  async onError(
    commandName: string,
    input: unknown,
    error: Error,
    metadata: CommandMetadata,
  ): Promise<void> {
    const auditLog: AuditLog = {
      commandName,
      commandId: metadata.commandId,
      userId: metadata.userId,
      input: sanitizeCommandInput(input),
      error: error.message,
      metadata,
      timestamp: new Date(),
    };

    await this.saveAuditLog(auditLog);
  }

  private async saveAuditLog(log: AuditLog): Promise<void> {
    // Store in memory, newest entries only
    this.auditLogs.push(log);
    if (this.auditLogs.length > this.maxLogs) {
      this.auditLogs.shift(); // Remove oldest
    }

    // Persist to database if enabled
    if (this.persistToDatabase) {
      try {
        // You would implement actual database persistence here
        // For now, just log it
        console.log("[AuditMiddleware] Audit log saved:", {
          commandName: log.commandName,
          commandId: log.commandId,
          userId: log.userId,
          timestamp: log.timestamp,
        });
      } catch (error) {
        console.error("[AuditMiddleware] Failed to persist audit log:", error);
      }
    }
  }

  /**
   * Get audit logs
   */
  getAuditLogs(): AuditLog[] {
    return this.auditLogs;
  }

  /**
   * Get audit logs by user
   */
  getAuditLogsByUser(userId: string): AuditLog[] {
    return this.auditLogs.filter((log) => log.userId === userId);
  }

  /**
   * Clear audit logs
   */
  clearAuditLogs(): void {
    this.auditLogs = [];
  }
}
