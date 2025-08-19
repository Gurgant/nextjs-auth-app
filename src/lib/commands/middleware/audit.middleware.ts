import { ICommandMiddleware } from './middleware.interface'
import { CommandMetadata } from '../base/command.interface'
import { prisma } from '@/lib/prisma'

interface AuditLog {
  commandName: string
  commandId: string
  userId?: string
  input: any
  output?: any
  error?: string
  duration?: number
  metadata: CommandMetadata
  timestamp: Date
}

export class AuditMiddleware implements ICommandMiddleware {
  name = 'AuditMiddleware'
  
  private auditLogs: AuditLog[] = []
  private persistToDatabase: boolean
  
  constructor(persistToDatabase: boolean = false) {
    this.persistToDatabase = persistToDatabase
  }
  
  async after(
    commandName: string,
    input: any,
    output: any,
    metadata: CommandMetadata,
    duration: number
  ): Promise<void> {
    const auditLog: AuditLog = {
      commandName,
      commandId: metadata.commandId,
      userId: metadata.userId,
      input: this.sanitizeInput(input),
      output: this.sanitizeOutput(output),
      duration,
      metadata,
      timestamp: new Date()
    }
    
    await this.saveAuditLog(auditLog)
  }
  
  async onError(
    commandName: string,
    input: any,
    error: Error,
    metadata: CommandMetadata
  ): Promise<void> {
    const auditLog: AuditLog = {
      commandName,
      commandId: metadata.commandId,
      userId: metadata.userId,
      input: this.sanitizeInput(input),
      error: error.message,
      metadata,
      timestamp: new Date()
    }
    
    await this.saveAuditLog(auditLog)
  }
  
  private async saveAuditLog(log: AuditLog): Promise<void> {
    // Store in memory
    this.auditLogs.push(log)
    
    // Persist to database if enabled
    if (this.persistToDatabase) {
      try {
        // You would implement actual database persistence here
        // For now, just log it
        console.log('[AuditMiddleware] Audit log saved:', {
          commandName: log.commandName,
          commandId: log.commandId,
          userId: log.userId,
          timestamp: log.timestamp
        })
      } catch (error) {
        console.error('[AuditMiddleware] Failed to persist audit log:', error)
      }
    }
  }
  
  /**
   * Sanitize sensitive input data
   */
  private sanitizeInput(input: any): any {
    if (!input) return input
    
    const sanitized = { ...input }
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'confirmPassword', 'currentPassword', 'newPassword', 'token', 'secret']
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]'
      }
    })
    
    return sanitized
  }
  
  /**
   * Sanitize sensitive output data
   */
  private sanitizeOutput(output: any): any {
    if (!output) return output
    
    const sanitized = { ...output }
    
    // Remove sensitive fields from output
    if (sanitized.token) {
      sanitized.token = '[REDACTED]'
    }
    
    return sanitized
  }
  
  /**
   * Get audit logs
   */
  getAuditLogs(): AuditLog[] {
    return this.auditLogs
  }
  
  /**
   * Get audit logs by user
   */
  getAuditLogsByUser(userId: string): AuditLog[] {
    return this.auditLogs.filter(log => log.userId === userId)
  }
  
  /**
   * Clear audit logs
   */
  clearAuditLogs(): void {
    this.auditLogs = []
  }
}