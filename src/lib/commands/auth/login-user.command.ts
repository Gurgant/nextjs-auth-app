import { z } from 'zod'
import { BaseCommand } from '../base/command.base'
import { CommandMetadata } from '../base/command.interface'
import { repositories } from '@/lib/repositories'
import { eventBus } from '@/lib/events'
import { UserLoggedInEvent } from '@/lib/events/domain/auth.events'
import { LoginFailedEvent, RateLimitExceededEvent } from '@/lib/events/domain/security.events'
import { 
  createSuccessResponse,
  createErrorResponse,
  ActionResponse 
} from '@/lib/utils/form-responses'
import {
  loginEmailSchema,
  loginPasswordSchema
} from '@/lib/validation'
import { LRUCache } from 'lru-cache'
import { ErrorFactory } from '@/lib/errors/error-factory'
import { createError } from '@/lib/errors/error-builder'

export interface LoginUserInput {
  email: string
  password: string
  locale?: string
}

const loginSchema = z.object({
  email: loginEmailSchema,
  password: loginPasswordSchema,
})

// Rate limiting cache
const loginRateLimiter = new LRUCache<string, number>({
  max: 500,
  ttl: 60 * 1000, // 1 minute
})

const RATE_LIMIT_ATTEMPTS = 5
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute

export class LoginUserCommand extends BaseCommand<LoginUserInput, ActionResponse> {
  readonly name = 'LoginUserCommand'
  readonly description = 'Authenticate user with email and password'
  
  private authenticatedUserId?: string
  
  get canUndo(): boolean {
    return false // Login cannot be undone
  }
  
  async validate(input: LoginUserInput): Promise<boolean> {
    try {
      loginSchema.parse(input)
      
      // Check rate limiting
      const attempts = loginRateLimiter.get(input.email) || 0
      if (attempts >= RATE_LIMIT_ATTEMPTS) {
        console.log(`[${this.name}] Rate limit exceeded for: ${input.email}`)
        return false
      }
      
      return true
    } catch (error) {
      console.error(`[${this.name}] Validation failed:`, error)
      return false
    }
  }
  
  async execute(
    input: LoginUserInput, 
    metadata?: CommandMetadata
  ): Promise<ActionResponse> {
    this.logExecution(input, metadata)
    
    try {
      // Validate input
      const validationResult = loginSchema.safeParse(input)
      if (!validationResult.success) {
        const error = ErrorFactory.validation.fromZod(validationResult.error, {
          correlationId: metadata?.commandId
        })
        error.log()
        return createErrorResponse(error.getUserMessage())
      }
      
      // Check rate limiting
      const attempts = loginRateLimiter.get(input.email) || 0
      if (attempts >= RATE_LIMIT_ATTEMPTS) {
        // Emit rate limit exceeded event
        await eventBus.publish(new RateLimitExceededEvent({
          identifier: input.email,
          action: 'login',
          limit: RATE_LIMIT_ATTEMPTS,
          window: RATE_LIMIT_WINDOW / 1000,
          attemptCount: attempts,
          exceededAt: new Date()
        }, {
          correlationId: metadata?.commandId,
          ipAddress: metadata?.ipAddress,
          userAgent: metadata?.userAgent
        }))
        
        const error = ErrorFactory.system.rateLimit(
          RATE_LIMIT_ATTEMPTS,
          '1 minute',
          new Date(Date.now() + RATE_LIMIT_WINDOW),
          {
            correlationId: metadata?.commandId,
            ipAddress: metadata?.ipAddress,
            userAgent: metadata?.userAgent
          }
        )
        error.log()
        return createErrorResponse(error.getUserMessage())
      }
      
      const userRepo = repositories.getUserRepository()
      
      // Find and validate user credentials
      const user = await userRepo.findByCredentials(input.email, input.password)
      
      if (!user) {
        // Increment rate limit counter on failed attempt
        loginRateLimiter.set(input.email, attempts + 1)
        
        // Emit login failed event
        await eventBus.publish(new LoginFailedEvent({
          email: input.email,
          reason: 'invalid_credentials',
          attemptNumber: attempts + 1,
          ipAddress: metadata?.ipAddress,
          userAgent: metadata?.userAgent,
          failedAt: new Date()
        }, {
          correlationId: metadata?.commandId
        }))
        
        const errorBuilder = createError()
        if (metadata?.commandId) errorBuilder.withCorrelationId(metadata.commandId)
        const error = errorBuilder
          .auth.invalidCredentials()
        error.log()
        return createErrorResponse(error.getUserMessage())
      }
      
      // Reset rate limit counter on successful login
      loginRateLimiter.delete(input.email)
      
      // Update last login
      await userRepo.updateLastLogin(user.id)
      
      this.authenticatedUserId = user.id
      
      // Emit login success event
      await eventBus.publish(new UserLoggedInEvent({
        userId: user.id,
        email: user.email,
        method: 'credentials',
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
        loginAt: new Date()
      }, {
        userId: user.id,
        correlationId: metadata?.commandId,
        locale: input.locale
      }))
      
      // Check if email is verified
      const emailVerified = user.emailVerified !== null
      
      const response = createSuccessResponse(
        emailVerified 
          ? 'Login successful!' 
          : 'Login successful! Please verify your email.',
        { 
          userId: user.id,
          emailVerified,
          requiresVerification: !emailVerified
        }
      )
      
      this.logSuccess(response)
      return response
      
    } catch (error) {
      const baseError = ErrorFactory.wrap(error, {
        correlationId: metadata?.commandId
      })
      baseError.log()
      this.logError(baseError)
      
      // Increment rate limit on any error
      const attempts = loginRateLimiter.get(input.email) || 0
      loginRateLimiter.set(input.email, attempts + 1)
      
      return createErrorResponse(baseError.getUserMessage())
    }
  }
}