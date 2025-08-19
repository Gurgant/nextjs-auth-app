import { NextRequest, NextResponse } from 'next/server'
import { BaseError } from '../base/base-error'
import { ErrorCode, ErrorSeverity } from '../base/error-codes'
import { ErrorFactory } from '../error-factory'
import { z } from 'zod'

/**
 * Error response format
 */
interface ErrorResponse {
  error: {
    id: string
    code: string
    message: string
    details?: any
    suggestedAction?: string
  }
  timestamp: string
  path?: string
  method?: string
}

/**
 * Global error handler for Next.js API routes
 */
export class ErrorHandler {
  private static instance: ErrorHandler
  private isDevelopment: boolean
  
  private constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development'
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): ErrorHandler {
    if (!this.instance) {
      this.instance = new ErrorHandler()
    }
    return this.instance
  }
  
  /**
   * Handle error and return appropriate response
   */
  handle(error: unknown, request?: NextRequest): NextResponse<ErrorResponse> {
    const baseError = this.normalizeError(error)
    
    // Log error based on severity
    this.logError(baseError, request)
    
    // Create error response
    const response = this.createErrorResponse(baseError, request)
    
    // Return Next.js response
    return NextResponse.json(response, {
      status: baseError.statusCode,
      headers: this.getResponseHeaders(baseError)
    })
  }
  
  /**
   * Normalize any error to BaseError
   */
  private normalizeError(error: unknown): BaseError {
    // Already a BaseError
    if (error instanceof BaseError) {
      return error
    }
    
    // Zod validation error
    if (error instanceof z.ZodError) {
      return ErrorFactory.validation.fromZod(error)
    }
    
    // Prisma errors
    if (this.isPrismaError(error)) {
      return this.handlePrismaError(error)
    }
    
    // Standard Error
    if (error instanceof Error) {
      return ErrorFactory.system.internal(error.message, error)
    }
    
    // Unknown error
    return ErrorFactory.system.internal('An unknown error occurred')
  }
  
  /**
   * Check if error is from Prisma
   */
  private isPrismaError(error: any): boolean {
    return error?.code?.startsWith('P')
  }
  
  /**
   * Handle Prisma-specific errors
   */
  private handlePrismaError(error: any): BaseError {
    switch (error.code) {
      case 'P2002': // Unique constraint violation
        const field = error.meta?.target?.[0] || 'field'
        return ErrorFactory.validation.duplicate(field, error.meta?.target)
      
      case 'P2025': // Record not found
        return ErrorFactory.business.notFound('Record')
      
      case 'P2003': // Foreign key constraint
        return ErrorFactory.business.dependency(
          'foreign key',
          'delete',
          'Referenced by other records'
        )
      
      case 'P2024': // Timeout
        return ErrorFactory.system.timeout('Database operation', 10000)
      
      default:
        return ErrorFactory.system.database('query', error.message, error)
    }
  }
  
  /**
   * Log error based on severity
   */
  private logError(error: BaseError, request?: NextRequest): void {
    const logData = {
      errorId: error.id,
      code: error.code,
      message: error.message,
      severity: error.severity,
      category: error.category,
      statusCode: error.statusCode,
      path: request?.url,
      method: request?.method,
      headers: this.isDevelopment ? request?.headers : undefined,
      stack: this.isDevelopment ? error.stack : undefined,
      details: error.details,
      context: error.context
    }
    
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        console.error('[CRITICAL ERROR]', logData)
        // In production, send to monitoring service
        this.sendToMonitoring(error, request)
        break
      
      case ErrorSeverity.HIGH:
        console.error('[HIGH ERROR]', logData)
        this.sendToMonitoring(error, request)
        break
      
      case ErrorSeverity.MEDIUM:
        console.warn('[MEDIUM ERROR]', logData)
        break
      
      default:
        console.log('[LOW ERROR]', logData)
    }
  }
  
  /**
   * Send error to monitoring service
   */
  private sendToMonitoring(error: BaseError, request?: NextRequest): void {
    // TODO: Integrate with monitoring service (Sentry, DataDog, etc.)
    // This is a placeholder for monitoring integration
    if (process.env.SENTRY_DSN) {
      // Sentry integration would go here
    }
  }
  
  /**
   * Create error response
   */
  private createErrorResponse(error: BaseError, request?: NextRequest): ErrorResponse {
    const response: ErrorResponse = {
      error: {
        id: error.id,
        code: error.code,
        message: error.getUserMessage(),
        suggestedAction: error.getSuggestedAction()
      },
      timestamp: new Date().toISOString(),
      path: request?.url,
      method: request?.method
    }
    
    // Include details in development
    if (this.isDevelopment) {
      response.error.details = error.details
    }
    
    return response
  }
  
  /**
   * Get response headers based on error
   */
  private getResponseHeaders(error: BaseError): HeadersInit {
    const headers: HeadersInit = {
      'X-Error-Id': error.id,
      'X-Error-Code': error.code
    }
    
    // Add retry headers for rate limit errors
    if (error.code === ErrorCode.RATE_LIMIT_EXCEEDED) {
      const resetAt = error.details?.resetAt
      if (resetAt) {
        headers['X-RateLimit-Reset'] = resetAt.toISOString()
        headers['Retry-After'] = Math.ceil((resetAt.getTime() - Date.now()) / 1000).toString()
      }
    }
    
    return headers
  }
}

/**
 * Error handler middleware for API routes
 */
export function withErrorHandler<T = any>(
  handler: (req: NextRequest) => Promise<NextResponse<T>>
) {
  return async (req: NextRequest): Promise<NextResponse<T | ErrorResponse>> => {
    try {
      return await handler(req)
    } catch (error) {
      return ErrorHandler.getInstance().handle(error, req)
    }
  }
}

/**
 * Async error boundary for server components
 */
export async function catchAsync<T>(
  fn: () => Promise<T>,
  fallback?: T
): Promise<T | undefined> {
  try {
    return await fn()
  } catch (error) {
    const baseError = ErrorFactory.wrap(error)
    baseError.log()
    return fallback
  }
}

/**
 * Error boundary for sync operations
 */
export function catchSync<T>(
  fn: () => T,
  fallback?: T
): T | undefined {
  try {
    return fn()
  } catch (error) {
    const baseError = ErrorFactory.wrap(error)
    baseError.log()
    return fallback
  }
}

/**
 * Retry mechanism for retryable errors
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number
    delay?: number
    backoff?: number
    shouldRetry?: (error: BaseError, attempt: number) => boolean
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = 2,
    shouldRetry = (error) => error.isRetryable()
  } = options
  
  let lastError: BaseError
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = ErrorFactory.wrap(error)
      
      if (attempt === maxAttempts || !shouldRetry(lastError, attempt)) {
        throw lastError
      }
      
      // Calculate delay with exponential backoff
      const waitTime = delay * Math.pow(backoff, attempt - 1)
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }
  
  throw lastError!
}

/**
 * Circuit breaker for external services
 */
export class CircuitBreaker {
  private failures = 0
  private lastFailureTime?: Date
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'
  
  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000 // 1 minute
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should be reset
    if (this.state === 'OPEN' && this.shouldReset()) {
      this.state = 'HALF_OPEN'
      this.failures = 0
    }
    
    // If circuit is open, fail fast
    if (this.state === 'OPEN') {
      throw ErrorFactory.system.circuitBreakerOpen(
        'Service',
        this.failures,
        this.threshold,
        new Date(this.lastFailureTime!.getTime() + this.timeout)
      )
    }
    
    try {
      const result = await fn()
      
      // Success - reset circuit
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED'
        this.failures = 0
      }
      
      return result
    } catch (error) {
      this.failures++
      this.lastFailureTime = new Date()
      
      // Open circuit if threshold exceeded
      if (this.failures >= this.threshold) {
        this.state = 'OPEN'
      }
      
      throw error
    }
  }
  
  private shouldReset(): boolean {
    if (!this.lastFailureTime) return false
    return Date.now() - this.lastFailureTime.getTime() > this.timeout
  }
  
  reset(): void {
    this.failures = 0
    this.state = 'CLOSED'
    this.lastFailureTime = undefined
  }
}