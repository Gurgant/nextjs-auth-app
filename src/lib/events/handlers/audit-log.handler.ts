import { IEventHandler, IEvent } from '../base/event.interface'
import { 
  UserRegisteredEvent,
  UserLoggedInEvent,
  UserLoggedOutEvent,
  PasswordChangedEvent
} from '../domain/auth.events'
import {
  LoginFailedEvent,
  AccountLockedEvent,
  SuspiciousActivityEvent,
  SecurityAlertEvent
} from '../domain/security.events'
import {
  CommandExecutedEvent,
  CommandFailedEvent,
  ErrorOccurredEvent
} from '../domain/system.events'

interface AuditLogEntry {
  id: string
  timestamp: Date
  eventType: string
  eventId: string
  userId?: string
  action: string
  details: Record<string, any>
  severity: 'info' | 'warning' | 'error' | 'critical'
  ipAddress?: string
  userAgent?: string
}

export class AuditLogHandler implements IEventHandler {
  readonly eventType = '*' // Listen to all events
  readonly handlerName = 'AuditLogHandler'
  
  private auditLogs: AuditLogEntry[] = []
  private maxLogs: number
  
  constructor(maxLogs: number = 10000) {
    this.maxLogs = maxLogs
  }
  
  async handle(event: IEvent): Promise<void> {
    const auditEntry = this.createAuditEntry(event)
    if (auditEntry) {
      await this.saveAuditLog(auditEntry)
    }
  }
  
  private createAuditEntry(event: IEvent): AuditLogEntry | null {
    const baseEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: event.metadata.timestamp,
      eventType: event.type,
      eventId: event.metadata.eventId,
      userId: event.metadata.userId,
      ipAddress: event.metadata.ipAddress,
      userAgent: event.metadata.userAgent
    }
    
    // Map specific events to audit entries
    switch (event.type) {
      case 'user.registered':
        const regEvent = event as UserRegisteredEvent
        return {
          ...baseEntry,
          action: 'User Registration',
          details: {
            email: regEvent.payload.email,
            provider: regEvent.payload.provider
          },
          severity: 'info'
        }
        
      case 'user.logged_in':
        const loginEvent = event as UserLoggedInEvent
        return {
          ...baseEntry,
          action: 'User Login',
          details: {
            method: loginEvent.payload.method,
            provider: loginEvent.payload.provider
          },
          severity: 'info'
        }
        
      case 'user.logged_out':
        return {
          ...baseEntry,
          action: 'User Logout',
          details: {},
          severity: 'info'
        }
        
      case 'user.password_changed':
        return {
          ...baseEntry,
          action: 'Password Changed',
          details: {
            requiresLogout: (event as PasswordChangedEvent).payload.requiresLogout
          },
          severity: 'warning'
        }
        
      case 'security.login_failed':
        const failedLogin = event as LoginFailedEvent
        return {
          ...baseEntry,
          action: 'Login Failed',
          details: {
            email: failedLogin.payload.email,
            reason: failedLogin.payload.reason,
            attemptNumber: failedLogin.payload.attemptNumber
          },
          severity: 'warning'
        }
        
      case 'security.account_locked':
        const lockEvent = event as AccountLockedEvent
        return {
          ...baseEntry,
          action: 'Account Locked',
          details: {
            reason: lockEvent.payload.reason,
            lockedUntil: lockEvent.payload.lockedUntil
          },
          severity: 'error'
        }
        
      case 'security.suspicious_activity':
        const suspicious = event as SuspiciousActivityEvent
        return {
          ...baseEntry,
          action: 'Suspicious Activity Detected',
          details: {
            activityType: suspicious.payload.activityType,
            details: suspicious.payload.details
          },
          severity: suspicious.payload.severity as any
        }
        
      case 'security.alert':
        const alert = event as SecurityAlertEvent
        return {
          ...baseEntry,
          action: 'Security Alert',
          details: {
            alertType: alert.payload.alertType,
            message: alert.payload.message,
            affectedUsers: alert.payload.affectedUsers
          },
          severity: alert.payload.severity as any
        }
        
      case 'system.command_executed':
        const cmdEvent = event as CommandExecutedEvent
        return {
          ...baseEntry,
          action: `Command: ${cmdEvent.payload.commandName}`,
          details: {
            success: cmdEvent.payload.success,
            duration: cmdEvent.payload.duration
          },
          severity: 'info'
        }
        
      case 'system.command_failed':
        const cmdFailed = event as CommandFailedEvent
        return {
          ...baseEntry,
          action: `Command Failed: ${cmdFailed.payload.commandName}`,
          details: {
            error: cmdFailed.payload.error
          },
          severity: 'error'
        }
        
      case 'system.error_occurred':
        const error = event as ErrorOccurredEvent
        return {
          ...baseEntry,
          action: 'System Error',
          details: {
            errorType: error.payload.errorType,
            message: error.payload.message,
            context: error.payload.context
          },
          severity: error.payload.severity as any
        }
        
      default:
        // Log all other events as info
        return {
          ...baseEntry,
          action: event.type,
          details: event.payload,
          severity: 'info'
        }
    }
  }
  
  private async saveAuditLog(entry: AuditLogEntry): Promise<void> {
    this.auditLogs.push(entry)
    
    // Maintain max size
    if (this.auditLogs.length > this.maxLogs) {
      this.auditLogs.shift()
    }
    
    // Log critical events
    if (entry.severity === 'critical' || entry.severity === 'error') {
      console.error(`[AUDIT] ${entry.severity.toUpperCase()}: ${entry.action}`, {
        userId: entry.userId,
        details: entry.details,
        timestamp: entry.timestamp
      })
    } else if (process.env.NODE_ENV === 'development') {
      console.log(`[AUDIT] ${entry.action}`, {
        userId: entry.userId,
        severity: entry.severity
      })
    }
    
    // In production, you would persist to database here
    // await prisma.auditLog.create({ data: entry })
  }
  
  /**
   * Get audit logs
   */
  getAuditLogs(filters?: {
    userId?: string
    severity?: string
    startDate?: Date
    endDate?: Date
    limit?: number
  }): AuditLogEntry[] {
    let logs = [...this.auditLogs]
    
    if (filters) {
      if (filters.userId) {
        logs = logs.filter(l => l.userId === filters.userId)
      }
      if (filters.severity) {
        logs = logs.filter(l => l.severity === filters.severity)
      }
      if (filters.startDate) {
        logs = logs.filter(l => l.timestamp >= filters.startDate!)
      }
      if (filters.endDate) {
        logs = logs.filter(l => l.timestamp <= filters.endDate!)
      }
      if (filters.limit) {
        logs = logs.slice(-filters.limit)
      }
    }
    
    return logs
  }
  
  /**
   * Get audit statistics
   */
  getStats() {
    const stats = {
      totalLogs: this.auditLogs.length,
      bySeverity: new Map<string, number>(),
      byAction: new Map<string, number>(),
      recentErrors: [] as AuditLogEntry[]
    }
    
    for (const log of this.auditLogs) {
      // Count by severity
      const severityCount = stats.bySeverity.get(log.severity) || 0
      stats.bySeverity.set(log.severity, severityCount + 1)
      
      // Count by action
      const actionCount = stats.byAction.get(log.action) || 0
      stats.byAction.set(log.action, actionCount + 1)
      
      // Collect recent errors
      if ((log.severity === 'error' || log.severity === 'critical') && 
          log.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000)) {
        stats.recentErrors.push(log)
      }
    }
    
    return stats
  }
}