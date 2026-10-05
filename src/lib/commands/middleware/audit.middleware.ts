import { ICommandMiddleware } from "./middleware.interface";
import { CommandMetadata } from "../base/command.interface";
import { answerSaysSuccess } from "../base/outcome";
import { describeThrown, isThrownError } from "../base/thrown";

/** Entries kept in memory; older ones are dropped first. */
export const DEFAULT_MAX_AUDIT_LOGS = 1000;

// An entry keeps ids, the time, the duration and the outcome: no input, no
// output, no error message and nothing else of the command metadata (client
// IP address, User-Agent, locale).
//
// One entry is written when the command has returned, and one when the bus
// caught something: thrown by the command, or by a step after it (a later
// `after` middleware, publishing the executed event). When a step after the
// command fails, one command id has two entries: what the command answered,
// then what the bus caught.
interface AuditLog {
  commandName: string;
  commandId: string;
  userId?: string;
  timestamp: Date;
  /** As the bus measured it; not on an entry for something the bus caught. */
  duration?: number;
  /**
   * What the command's answer says (see outcome.ts); false on an entry for
   * something the bus caught while or after running the command.
   */
  success: boolean;
  /**
   * Only on such an entry: the class name of the Error the bus caught, or
   * the fixed description of a value that is not an Error.
   */
  errorType?: string;
}

/** What a class name may look like to be kept: an identifier, not free text. */
const CLASS_NAME = /^[A-Za-z_$][\w$]{0,63}$/;

/**
 * Class name of what the bus caught, never its message. The bus hands over
 * whatever was thrown, which need not be an Error: then it is the description
 * that the failed event of the bus carries (see thrown.ts), so that the two
 * agree.
 * The class is read from the prototype, not from the object itself (an object
 * can carry a `constructor` property of its own), and its name is kept only
 * when it is an identifier; anything else is recorded as "Error".
 *
 * In a production build the minifier renames the classes of the application
 * (see `handlers` in command-bus.ts), so for one of those the name is the
 * minified identifier, such as `R` or `aa`. Built-in classes ("Error",
 * "TypeError") keep their names.
 */
function thrownClassName(thrown: unknown): string {
  if (!isThrownError(thrown)) {
    return describeThrown(thrown).message;
  }
  const prototype: { constructor?: { name?: unknown } } | null =
    Object.getPrototypeOf(thrown);
  const name = prototype?.constructor?.name;
  return typeof name === "string" && CLASS_NAME.test(name) ? name : "Error";
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
      timestamp: new Date(),
      duration,
      success: answerSaysSuccess(output),
    };

    await this.saveAuditLog(auditLog);
  }

  async onError(
    commandName: string,
    input: unknown,
    error: unknown,
    metadata: CommandMetadata,
  ): Promise<void> {
    const auditLog: AuditLog = {
      commandName,
      commandId: metadata.commandId,
      userId: metadata.userId,
      timestamp: new Date(),
      success: false,
      errorType: thrownClassName(error),
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
}
