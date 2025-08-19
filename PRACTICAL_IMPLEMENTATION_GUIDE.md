# 🛠️ Practical Implementation Guide - Immediate Actions

## Quick Wins - Implement Today

### 1. Repository Pattern - User Repository

#### Step 1: Create Base Repository Interface
```typescript
// src/lib/repositories/base/repository.interface.ts
export interface IRepository<T, ID = string> {
  findById(id: ID): Promise<T | null>
  findAll(): Promise<T[]>
  create(data: Partial<T>): Promise<T>
  update(id: ID, data: Partial<T>): Promise<T>
  delete(id: ID): Promise<boolean>
  exists(id: ID): Promise<boolean>
}

// src/lib/repositories/base/prisma.repository.ts
export abstract class PrismaRepository<T, ID = string> implements IRepository<T, ID> {
  constructor(protected readonly prisma: PrismaClient) {}
  
  abstract findById(id: ID): Promise<T | null>
  abstract findAll(): Promise<T[]>
  abstract create(data: Partial<T>): Promise<T>
  abstract update(id: ID, data: Partial<T>): Promise<T>
  abstract delete(id: ID): Promise<boolean>
  abstract exists(id: ID): Promise<boolean>
}
```

#### Step 2: Implement User Repository
```typescript
// src/lib/repositories/user/user.repository.interface.ts
import { User } from '@prisma/client'

export interface IUserRepository extends IRepository<User> {
  findByEmail(email: string): Promise<User | null>
  findByCredentials(email: string, password: string): Promise<User | null>
  createWithAccount(userData: CreateUserDto): Promise<User>
  updateLastLogin(userId: string): Promise<void>
}

// src/lib/repositories/user/user.repository.ts
export class UserRepository extends PrismaRepository<User> implements IUserRepository {
  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } })
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } })
  }

  async findByCredentials(email: string, password: string): Promise<User | null> {
    const user = await this.findByEmail(email)
    if (!user) return null
    
    const isValid = await bcrypt.compare(password, user.password || '')
    return isValid ? user : null
  }

  async createWithAccount(userData: CreateUserDto): Promise<User> {
    return this.prisma.user.create({
      data: {
        ...userData,
        accounts: {
          create: {
            type: 'credentials',
            provider: 'credentials',
            providerAccountId: userData.email,
          }
        }
      }
    })
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLogin: new Date() }
    })
  }
}
```

#### Step 3: Create Repository Provider
```typescript
// src/lib/repositories/provider.ts
import { PrismaClient } from '@prisma/client'
import { UserRepository } from './user/user.repository'

class RepositoryProvider {
  private static instance: RepositoryProvider
  private userRepository: UserRepository | null = null

  private constructor(private prisma: PrismaClient) {}

  static getInstance(prisma: PrismaClient): RepositoryProvider {
    if (!RepositoryProvider.instance) {
      RepositoryProvider.instance = new RepositoryProvider(prisma)
    }
    return RepositoryProvider.instance
  }

  getUserRepository(): UserRepository {
    if (!this.userRepository) {
      this.userRepository = new UserRepository(this.prisma)
    }
    return this.userRepository
  }
}

// Export singleton instance
export const repositories = RepositoryProvider.getInstance(prisma)
```

#### Step 4: Update Auth Callbacks to Use Repository
```typescript
// src/lib/auth-config.ts
import { repositories } from '@/lib/repositories/provider'

export const authOptions: NextAuthOptions = {
  callbacks: {
    async signIn({ user, account, profile }) {
      const userRepo = repositories.getUserRepository()
      
      if (account?.provider === 'credentials') {
        const existingUser = await userRepo.findByEmail(user.email!)
        if (existingUser) {
          await userRepo.updateLastLogin(existingUser.id)
        }
      }
      return true
    },
    
    async session({ session, token }) {
      if (token?.sub && session.user) {
        const userRepo = repositories.getUserRepository()
        const user = await userRepo.findById(token.sub)
        if (user) {
          session.user.id = user.id
          session.user.name = user.name
        }
      }
      return session
    }
  }
}
```

---

### 2. Command Pattern - Form Actions

#### Step 1: Create Command Base
```typescript
// src/lib/commands/base/command.interface.ts
export interface ICommand<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>
  validate?(input: TInput): Promise<boolean>
  canUndo?: boolean
  undo?(): Promise<void>
}

// src/lib/commands/base/command.base.ts
export abstract class BaseCommand<TInput, TOutput> implements ICommand<TInput, TOutput> {
  protected executedAt?: Date
  protected input?: TInput
  protected output?: TOutput

  abstract execute(input: TInput): Promise<TOutput>

  async validate(input: TInput): Promise<boolean> {
    return true // Override in subclasses
  }

  get canUndo(): boolean {
    return false // Override if undoable
  }

  async undo(): Promise<void> {
    throw new Error('This command cannot be undone')
  }
}
```

#### Step 2: Implement Registration Command
```typescript
// src/lib/commands/auth/register.command.ts
import { z } from 'zod'
import { repositories } from '@/lib/repositories/provider'
import { registerSchema } from '@/lib/validation/schemas'

export class RegisterUserCommand extends BaseCommand<RegisterInput, RegisterOutput> {
  private createdUserId?: string

  async validate(input: RegisterInput): Promise<boolean> {
    try {
      registerSchema.parse(input)
      const userRepo = repositories.getUserRepository()
      const exists = await userRepo.findByEmail(input.email)
      return !exists
    } catch {
      return false
    }
  }

  async execute(input: RegisterInput): Promise<RegisterOutput> {
    if (!await this.validate(input)) {
      return createErrorResponse('Validation failed')
    }

    this.input = input
    this.executedAt = new Date()

    const userRepo = repositories.getUserRepository()
    
    try {
      const hashedPassword = await bcrypt.hash(input.password, 12)
      const user = await userRepo.createWithAccount({
        email: input.email,
        name: input.name,
        password: hashedPassword
      })
      
      this.createdUserId = user.id
      this.output = createSuccessResponse('User registered successfully', { userId: user.id })
      
      // Emit event
      await eventBus.emit(new UserRegisteredEvent(user))
      
      return this.output
    } catch (error) {
      return createErrorResponse('Registration failed')
    }
  }

  get canUndo(): boolean {
    return true
  }

  async undo(): Promise<void> {
    if (!this.createdUserId) {
      throw new Error('No user to undo')
    }
    
    const userRepo = repositories.getUserRepository()
    await userRepo.delete(this.createdUserId)
    
    // Emit undo event
    await eventBus.emit(new UserRegistrationUndoneEvent(this.createdUserId))
  }
}
```

#### Step 3: Create Command Bus
```typescript
// src/lib/commands/command-bus.ts
export class CommandBus {
  private handlers = new Map<string, ICommand<any, any>>()
  private history: ExecutedCommand[] = []
  private middleware: CommandMiddleware[] = []

  register<T extends ICommand<any, any>>(
    commandClass: new () => T
  ): void {
    const instance = new commandClass()
    this.handlers.set(commandClass.name, instance)
  }

  use(middleware: CommandMiddleware): void {
    this.middleware.push(middleware)
  }

  async execute<TInput, TOutput>(
    commandClass: new () => ICommand<TInput, TOutput>,
    input: TInput
  ): Promise<TOutput> {
    const handler = this.handlers.get(commandClass.name)
    if (!handler) {
      throw new Error(`No handler registered for ${commandClass.name}`)
    }

    // Apply middleware
    for (const mw of this.middleware) {
      await mw.before?.(commandClass.name, input)
    }

    try {
      const result = await handler.execute(input)
      
      // Store in history if undoable
      if (handler.canUndo) {
        this.history.push({
          command: handler,
          timestamp: new Date(),
          input,
          output: result
        })
      }

      // Apply after middleware
      for (const mw of this.middleware) {
        await mw.after?.(commandClass.name, input, result)
      }

      return result
    } catch (error) {
      // Apply error middleware
      for (const mw of this.middleware) {
        await mw.onError?.(commandClass.name, input, error)
      }
      throw error
    }
  }

  async undo(): Promise<void> {
    const lastCommand = this.history.pop()
    if (!lastCommand?.command.canUndo) {
      throw new Error('No undoable commands in history')
    }
    await lastCommand.command.undo()
  }
}

// Create singleton instance
export const commandBus = new CommandBus()

// Register commands
commandBus.register(RegisterUserCommand)
commandBus.register(LoginUserCommand)

// Add logging middleware
commandBus.use({
  before: async (command, input) => {
    logger.info(`Executing command: ${command}`, { input })
  },
  after: async (command, input, output) => {
    logger.info(`Command executed: ${command}`, { output })
  },
  onError: async (command, input, error) => {
    logger.error(`Command failed: ${command}`, { error })
  }
})
```

#### Step 4: Use Commands in Actions
```typescript
// src/app/[locale]/(public)/register/actions.ts
import { commandBus } from '@/lib/commands/command-bus'
import { RegisterUserCommand } from '@/lib/commands/auth/register.command'

export async function registerAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  const locale = formData.get('locale') as string
  const t = await getTranslations({ locale })

  try {
    const input = {
      email: formData.get('email') as string,
      name: formData.get('name') as string,
      password: formData.get('password') as string,
      confirmPassword: formData.get('confirmPassword') as string
    }

    const result = await commandBus.execute(RegisterUserCommand, input)
    
    if (result.success) {
      // Redirect to login with success message
      return createSuccessResponse(t('register.success'))
    }
    
    return result
  } catch (error) {
    return createErrorResponse(t('errors.generic'))
  }
}
```

---

### 3. Event System - Audit & Monitoring

#### Step 1: Create Event Base
```typescript
// src/lib/events/base/event.interface.ts
export interface IEvent {
  id: string
  type: string
  timestamp: Date
  payload: Record<string, any>
  metadata?: EventMetadata
}

export interface EventMetadata {
  userId?: string
  ipAddress?: string
  userAgent?: string
  correlationId?: string
}

// src/lib/events/base/event.base.ts
import { randomUUID } from 'crypto'

export abstract class BaseEvent implements IEvent {
  readonly id: string = randomUUID()
  readonly timestamp: Date = new Date()
  abstract readonly type: string
  abstract readonly payload: Record<string, any>
  metadata?: EventMetadata

  constructor(metadata?: EventMetadata) {
    this.metadata = metadata
  }
}
```

#### Step 2: Define Domain Events
```typescript
// src/lib/events/auth/auth.events.ts
export class UserRegisteredEvent extends BaseEvent {
  readonly type = 'user.registered'
  
  constructor(
    public readonly payload: {
      userId: string
      email: string
      name: string
      registeredAt: Date
    },
    metadata?: EventMetadata
  ) {
    super(metadata)
  }
}

export class UserLoggedInEvent extends BaseEvent {
  readonly type = 'user.logged_in'
  
  constructor(
    public readonly payload: {
      userId: string
      email: string
      method: 'credentials' | 'oauth'
      provider?: string
    },
    metadata?: EventMetadata
  ) {
    super(metadata)
  }
}

export class SecurityAlertEvent extends BaseEvent {
  readonly type = 'security.alert'
  
  constructor(
    public readonly payload: {
      alertType: 'suspicious_login' | 'multiple_failed_attempts' | 'password_reset'
      userId?: string
      details: Record<string, any>
    },
    metadata?: EventMetadata
  ) {
    super(metadata)
  }
}
```

#### Step 3: Implement Event Bus
```typescript
// src/lib/events/event-bus.ts
type EventHandler = (event: IEvent) => Promise<void> | void

export class EventBus {
  private handlers = new Map<string, EventHandler[]>()
  private eventStore?: IEventStore

  setEventStore(store: IEventStore): void {
    this.eventStore = store
  }

  on(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType) || []
    handlers.push(handler)
    this.handlers.set(eventType, handlers)
  }

  off(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType) || []
    const index = handlers.indexOf(handler)
    if (index > -1) {
      handlers.splice(index, 1)
    }
  }

  async emit(event: IEvent): Promise<void> {
    // Store event
    if (this.eventStore) {
      await this.eventStore.store(event)
    }

    // Execute handlers
    const handlers = this.handlers.get(event.type) || []
    const globalHandlers = this.handlers.get('*') || []
    
    await Promise.all([
      ...handlers.map(h => h(event)),
      ...globalHandlers.map(h => h(event))
    ])
  }
}

// Create singleton
export const eventBus = new EventBus()

// Register handlers
eventBus.on('user.registered', async (event) => {
  // Send welcome email
  await emailService.sendWelcomeEmail(event.payload.email, event.payload.name)
  
  // Log to monitoring
  logger.info('New user registered', event.payload)
  
  // Update analytics
  await analytics.track('user_registered', event.payload)
})

eventBus.on('security.alert', async (event) => {
  // Log security event
  logger.warn('Security alert', event.payload)
  
  // Notify administrators if critical
  if (event.payload.alertType === 'multiple_failed_attempts') {
    await notificationService.notifyAdmins('Security Alert', event.payload)
  }
})

// Global audit handler
eventBus.on('*', async (event) => {
  // Store all events for audit trail
  await auditService.log(event)
})
```

---

### 4. Enhanced Error Handling

#### Step 1: Create Error Hierarchy
```typescript
// src/lib/errors/base.error.ts
export abstract class BaseError extends Error {
  abstract readonly code: string
  abstract readonly statusCode: number
  readonly timestamp = new Date()
  readonly id = randomUUID()

  constructor(
    message: string,
    public readonly details?: Record<string, any>
  ) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON() {
    return {
      id: this.id,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    }
  }
}

// src/lib/errors/auth.errors.ts
export class AuthenticationError extends BaseError {
  readonly code = 'AUTH_ERROR'
  readonly statusCode = 401
}

export class AuthorizationError extends BaseError {
  readonly code = 'FORBIDDEN'
  readonly statusCode = 403
}

export class ValidationError extends BaseError {
  readonly code = 'VALIDATION_ERROR'
  readonly statusCode = 400
  
  constructor(errors: z.ZodError | Record<string, string[]>) {
    super('Validation failed', { errors })
  }
}

export class RateLimitError extends BaseError {
  readonly code = 'RATE_LIMIT_EXCEEDED'
  readonly statusCode = 429
  
  constructor(retryAfter: number) {
    super('Too many requests', { retryAfter })
  }
}
```

#### Step 2: Create Error Handler Middleware
```typescript
// src/lib/errors/error-handler.ts
export class ErrorHandler {
  static handle(error: unknown): ActionResponse {
    // Log all errors
    logger.error('Error occurred', { error })

    // Handle known errors
    if (error instanceof BaseError) {
      // Emit error event
      eventBus.emit(new ErrorOccurredEvent(error))
      
      return createErrorResponse(
        error.message,
        error.details?.errors
      )
    }

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return createErrorResponse(
        'Validation failed',
        error.errors
      )
    }

    // Handle Prisma errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return createErrorResponse('Duplicate entry')
      }
      if (error.code === 'P2025') {
        return createErrorResponse('Record not found')
      }
    }

    // Default error
    return createErrorResponse('An unexpected error occurred')
  }

  static async handleAsync<T>(
    fn: () => Promise<T>
  ): Promise<T | ActionResponse> {
    try {
      return await fn()
    } catch (error) {
      return this.handle(error)
    }
  }
}
```

---

### 5. Testing Improvements

#### Step 1: Create Test Builders
```typescript
// src/__tests__/builders/user.builder.ts
import { faker } from '@faker-js/faker'
import { User } from '@prisma/client'

export class UserBuilder {
  private user: Partial<User> = {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    name: faker.person.fullName(),
    emailVerified: null,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date()
  }

  withId(id: string): this {
    this.user.id = id
    return this
  }

  withEmail(email: string): this {
    this.user.email = email
    return this
  }

  withName(name: string): this {
    this.user.name = name
    return this
  }

  withVerifiedEmail(): this {
    this.user.emailVerified = new Date()
    return this
  }

  build(): User {
    return this.user as User
  }

  buildMany(count: number): User[] {
    return Array.from({ length: count }, () => 
      new UserBuilder().build()
    )
  }
}
```

#### Step 2: Create Test Fixtures
```typescript
// src/__tests__/fixtures/database.fixture.ts
export class DatabaseFixture {
  constructor(private prisma: PrismaClient) {}

  async seedUsers(count = 10): Promise<User[]> {
    const users = new UserBuilder().buildMany(count)
    
    for (const user of users) {
      await this.prisma.user.create({ data: user })
    }
    
    return users
  }

  async cleanup(): Promise<void> {
    const tables = ['User', 'Account', 'Session']
    
    for (const table of tables) {
      await this.prisma.$executeRawUnsafe(
        `TRUNCATE TABLE "${table}" CASCADE`
      )
    }
  }

  async reset(): Promise<void> {
    await this.cleanup()
    await this.seedUsers()
  }
}
```

---

## 📝 Summary of Immediate Actions

1. **Implement Repository Pattern** for data access abstraction
2. **Add Command Pattern** for complex form actions
3. **Create Event System** for audit and monitoring
4. **Enhance Error Handling** with custom error types
5. **Improve Testing** with builders and fixtures

Each implementation is production-ready and can be integrated incrementally without breaking existing functionality.