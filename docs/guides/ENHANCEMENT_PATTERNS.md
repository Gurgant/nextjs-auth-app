# 🔧 Enhancement Patterns for Existing Projects

## 📚 Pattern Catalog

This guide provides copy-paste patterns for enhancing your existing Next.js application with enterprise-grade features from this template.

---

## 🏗️ Command Pattern Implementation

### Basic Command Structure

```typescript
// src/lib/commands/base/command.interface.ts
export interface ICommand<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
  validate?(input: TInput): Promise<boolean>;
  canUndo?: boolean;
  undo?(): Promise<void>;
}

// src/lib/commands/base/command.base.ts
export abstract class BaseCommand<TInput, TOutput>
  implements ICommand<TInput, TOutput>
{
  protected commandId: string = crypto.randomUUID();
  protected executedAt?: Date;

  async execute(input: TInput): Promise<TOutput> {
    try {
      // Log command execution
      console.log(`[Command] ${this.constructor.name} executing`, {
        commandId: this.commandId,
        input,
      });

      // Validate if validator exists
      if (this.validate) {
        const isValid = await this.validate(input);
        if (!isValid) {
          throw new Error("Validation failed");
        }
      }

      // Execute business logic
      this.executedAt = new Date();
      const result = await this.executeImpl(input);

      // Log success
      console.log(`[Command] ${this.constructor.name} completed`, {
        commandId: this.commandId,
        executedAt: this.executedAt,
      });

      return result;
    } catch (error) {
      // Log error
      console.error(`[Command] ${this.constructor.name} failed`, {
        commandId: this.commandId,
        error,
      });
      throw error;
    }
  }

  protected abstract executeImpl(input: TInput): Promise<TOutput>;
}
```

### Real-World Command Example

```typescript
// src/lib/commands/order/create-order.command.ts
import { z } from "zod";

const createOrderSchema = z.object({
  userId: z.string(),
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number().positive(),
      price: z.number().positive(),
    }),
  ),
  shippingAddress: z.object({
    street: z.string(),
    city: z.string(),
    country: z.string(),
    postalCode: z.string(),
  }),
});

type CreateOrderInput = z.infer<typeof createOrderSchema>;

export class CreateOrderCommand extends BaseCommand<CreateOrderInput, Order> {
  private createdOrderId?: string;

  async validate(input: CreateOrderInput): Promise<boolean> {
    const result = createOrderSchema.safeParse(input);
    if (!result.success) {
      console.error("Validation errors:", result.error.errors);
      return false;
    }

    // Additional business validation
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
    });

    if (!user || user.status === "suspended") {
      return false;
    }

    // Check inventory
    for (const item of input.items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
      });

      if (!product || product.stock < item.quantity) {
        return false;
      }
    }

    return true;
  }

  protected async executeImpl(input: CreateOrderInput): Promise<Order> {
    // Start transaction
    return await prisma.$transaction(async (tx) => {
      // Create order
      const order = await tx.order.create({
        data: {
          userId: input.userId,
          status: "pending",
          total: this.calculateTotal(input.items),
          shippingAddress: input.shippingAddress,
          items: {
            create: input.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      this.createdOrderId = order.id;

      // Update inventory
      for (const item of input.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: { decrement: item.quantity },
          },
        });
      }

      // Emit event
      await eventBus.publish(
        new OrderCreatedEvent({
          orderId: order.id,
          userId: input.userId,
          total: order.total,
          items: input.items,
        }),
      );

      return order;
    });
  }

  async undo(): Promise<void> {
    if (!this.createdOrderId) {
      throw new Error("No order to undo");
    }

    await prisma.$transaction(async (tx) => {
      // Get order details
      const order = await tx.order.findUnique({
        where: { id: this.createdOrderId },
        include: { items: true },
      });

      if (!order) return;

      // Restore inventory
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: { increment: item.quantity },
          },
        });
      }

      // Delete order
      await tx.order.delete({
        where: { id: this.createdOrderId },
      });

      // Emit cancellation event
      await eventBus.publish(
        new OrderCancelledEvent({
          orderId: this.createdOrderId,
          reason: "Command undo",
        }),
      );
    });
  }

  private calculateTotal(items: CreateOrderInput["items"]): number {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }
}
```

### Using Commands in Server Actions

```typescript
// src/app/actions/order.actions.ts
"use server";

export async function createOrder(input: CreateOrderInput) {
  const command = new CreateOrderCommand();

  try {
    const order = await command.execute(input);
    return { success: true, data: order };
  } catch (error) {
    // Rollback if needed
    if (command.canUndo) {
      await command.undo();
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Order creation failed",
    };
  }
}
```

---

## 🎭 Event-Driven Architecture

### Event System Setup

```typescript
// src/lib/events/base/event.interface.ts
export interface IEvent {
  id: string;
  type: string;
  payload: unknown;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// src/lib/events/base/event.base.ts
export abstract class BaseEvent implements IEvent {
  public readonly id: string;
  public readonly timestamp: Date;
  public readonly metadata?: Record<string, unknown>;

  constructor(
    public readonly type: string,
    public readonly payload: unknown,
    metadata?: Record<string, unknown>,
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = new Date();
    this.metadata = metadata;
  }
}

// src/lib/events/base/event-bus.ts
type EventHandler<T extends BaseEvent> = (event: T) => Promise<void>;

export class EventBus {
  private handlers = new Map<string, EventHandler<any>[]>();
  private eventQueue: BaseEvent[] = [];
  private processing = false;

  subscribe<T extends BaseEvent>(
    eventType: new (...args: any[]) => T,
    handler: EventHandler<T>,
  ): () => void {
    const type = eventType.name;

    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }

    this.handlers.get(type)!.push(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(type);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  async publish(event: BaseEvent): Promise<void> {
    // Add to queue
    this.eventQueue.push(event);

    // Process queue if not already processing
    if (!this.processing) {
      await this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    this.processing = true;

    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift()!;
      const handlers = this.handlers.get(event.constructor.name) || [];

      // Execute handlers in parallel
      await Promise.all(
        handlers.map((handler) =>
          handler(event).catch((error) =>
            console.error(`Event handler error for ${event.type}:`, error),
          ),
        ),
      );
    }

    this.processing = false;
  }
}

export const eventBus = new EventBus();
```

### Domain Events Implementation

```typescript
// src/lib/events/domain/user.events.ts
export class UserRegisteredEvent extends BaseEvent {
  constructor(payload: {
    userId: string;
    email: string;
    name: string;
    registeredAt: Date;
  }) {
    super("user.registered", payload);
  }
}

export class UserLoginEvent extends BaseEvent {
  constructor(payload: {
    userId: string;
    email: string;
    ip?: string;
    userAgent?: string;
  }) {
    super("user.login", payload);
  }
}

export class PasswordChangedEvent extends BaseEvent {
  constructor(payload: {
    userId: string;
    changedBy: "user" | "admin" | "system";
  }) {
    super("user.password.changed", payload);
  }
}
```

### Event Handlers Registration

```typescript
// src/lib/events/handlers/email.handler.ts
import { eventBus } from "../base/event-bus";
import { emailService } from "@/lib/services/email";

// Welcome email on registration
eventBus.subscribe(UserRegisteredEvent, async (event) => {
  await emailService.send({
    to: event.payload.email,
    subject: "Welcome to Our Platform!",
    template: "welcome",
    data: {
      name: event.payload.name,
      activationLink: `${process.env.NEXT_PUBLIC_APP_URL}/activate`,
    },
  });
});

// Security alert on password change
eventBus.subscribe(PasswordChangedEvent, async (event) => {
  const user = await prisma.user.findUnique({
    where: { id: event.payload.userId },
  });

  if (user) {
    await emailService.send({
      to: user.email,
      subject: "Password Changed",
      template: "password-changed",
      data: {
        name: user.name,
        changedBy: event.payload.changedBy,
        timestamp: event.timestamp,
      },
    });
  }
});

// src/lib/events/handlers/analytics.handler.ts
eventBus.subscribe(UserRegisteredEvent, async (event) => {
  await analytics.track({
    userId: event.payload.userId,
    event: "User Registered",
    properties: {
      email: event.payload.email,
      timestamp: event.payload.registeredAt,
    },
  });
});

eventBus.subscribe(UserLoginEvent, async (event) => {
  await analytics.track({
    userId: event.payload.userId,
    event: "User Login",
    properties: {
      ip: event.payload.ip,
      userAgent: event.payload.userAgent,
    },
  });
});

// src/lib/events/handlers/audit.handler.ts
eventBus.subscribe(PasswordChangedEvent, async (event) => {
  await prisma.auditLog.create({
    data: {
      userId: event.payload.userId,
      action: "PASSWORD_CHANGED",
      metadata: {
        changedBy: event.payload.changedBy,
        timestamp: event.timestamp,
      },
    },
  });
});
```

---

## 🗄️ Repository Pattern

### Repository Interface

```typescript
// src/lib/repositories/base/repository.interface.ts
export interface IRepository<T, ID = string> {
  findById(id: ID): Promise<T | null>;
  findAll(): Promise<T[]>;
  create(data: Partial<T>): Promise<T>;
  update(id: ID, data: Partial<T>): Promise<T>;
  delete(id: ID): Promise<boolean>;
  exists(id: ID): Promise<boolean>;
}

export interface IPaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface IPaginationOptions {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}
```

### Base Repository Implementation

```typescript
// src/lib/repositories/base/prisma.repository.ts
import { PrismaClient } from "@prisma/client";

export abstract class PrismaRepository<T, ID = string>
  implements IRepository<T, ID>
{
  constructor(
    protected prisma: PrismaClient,
    protected modelName: string,
  ) {}

  async findById(id: ID): Promise<T | null> {
    return await (this.prisma as any)[this.modelName].findUnique({
      where: { id },
    });
  }

  async findAll(): Promise<T[]> {
    return await (this.prisma as any)[this.modelName].findMany();
  }

  async create(data: Partial<T>): Promise<T> {
    return await (this.prisma as any)[this.modelName].create({
      data,
    });
  }

  async update(id: ID, data: Partial<T>): Promise<T> {
    return await (this.prisma as any)[this.modelName].update({
      where: { id },
      data,
    });
  }

  async delete(id: ID): Promise<boolean> {
    try {
      await (this.prisma as any)[this.modelName].delete({
        where: { id },
      });
      return true;
    } catch {
      return false;
    }
  }

  async exists(id: ID): Promise<boolean> {
    const count = await (this.prisma as any)[this.modelName].count({
      where: { id },
    });
    return count > 0;
  }

  protected async paginate(
    options: IPaginationOptions,
    where?: any,
  ): Promise<IPaginatedResult<T>> {
    const page = options.page || 1;
    const pageSize = options.pageSize || 10;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      (this.prisma as any)[this.modelName].findMany({
        where,
        skip,
        take: pageSize,
        orderBy: options.sortBy
          ? { [options.sortBy]: options.sortOrder || "asc" }
          : undefined,
      }),
      (this.prisma as any)[this.modelName].count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
```

### Domain Repository Example

```typescript
// src/lib/repositories/user.repository.ts
import { User, Prisma } from "@prisma/client";
import { PrismaRepository } from "./base/prisma.repository";
import bcrypt from "bcryptjs";

export interface IUserRepository extends IRepository<User> {
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  updatePassword(userId: string, newPassword: string): Promise<void>;
  verifyEmail(userId: string): Promise<void>;
  searchUsers(
    query: string,
    options?: IPaginationOptions,
  ): Promise<IPaginatedResult<User>>;
  getUsersWithRole(role: string): Promise<User[]>;
}

export class UserRepository
  extends PrismaRepository<User>
  implements IUserRepository
{
  constructor(prisma: PrismaClient) {
    super(prisma, "user");
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    return await this.prisma.user.findFirst({
      where: {
        username: {
          equals: username,
          mode: "insensitive",
        },
      },
    });
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
      },
    });

    // Emit event
    await eventBus.publish(
      new PasswordChangedEvent({
        userId,
        changedBy: "user",
      }),
    );
  }

  async verifyEmail(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerified: new Date(),
        verificationToken: null,
      },
    });
  }

  async searchUsers(
    query: string,
    options: IPaginationOptions = {},
  ): Promise<IPaginatedResult<User>> {
    const where: Prisma.UserWhereInput = {
      OR: [
        { email: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
        { username: { contains: query, mode: "insensitive" } },
      ],
    };

    return await this.paginate(options, where);
  }

  async getUsersWithRole(role: string): Promise<User[]> {
    return await this.prisma.user.findMany({
      where: { role },
      orderBy: { createdAt: "desc" },
    });
  }
}

// Singleton instance
export const userRepository = new UserRepository(prisma);
```

---

## 🛡️ Error Factory Pattern

### Error Factory Implementation

```typescript
// src/lib/errors/error.factory.ts
export class BaseError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public context?: Record<string, any>,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      context: this.context,
    };
  }

  getUserMessage(): string {
    // Override in subclasses for user-friendly messages
    return "An error occurred. Please try again.";
  }
}

export class ValidationError extends BaseError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, "VALIDATION_ERROR", 400, context);
  }

  getUserMessage(): string {
    return "Please check your input and try again.";
  }
}

export class AuthenticationError extends BaseError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, "AUTH_ERROR", 401, context);
  }

  getUserMessage(): string {
    return "Authentication failed. Please login again.";
  }
}

export class AuthorizationError extends BaseError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, "AUTHZ_ERROR", 403, context);
  }

  getUserMessage(): string {
    return "You do not have permission to perform this action.";
  }
}

export class NotFoundError extends BaseError {
  constructor(resource: string, context?: Record<string, any>) {
    super(`${resource} not found`, "NOT_FOUND", 404, context);
  }

  getUserMessage(): string {
    return "The requested resource was not found.";
  }
}

export class ConflictError extends BaseError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, "CONFLICT", 409, context);
  }

  getUserMessage(): string {
    return "This operation conflicts with existing data.";
  }
}

export class RateLimitError extends BaseError {
  constructor(retryAfter?: number) {
    super("Rate limit exceeded", "RATE_LIMIT", 429, { retryAfter });
  }

  getUserMessage(): string {
    return "Too many requests. Please try again later.";
  }
}

export const ErrorFactory = {
  validation: {
    required: (field: string) =>
      new ValidationError(`${field} is required`, { field }),

    invalid: (field: string, value?: any) =>
      new ValidationError(`Invalid ${field}`, { field, value }),

    fromZod: (zodError: any) => {
      const errors = zodError.errors.map((e: any) => ({
        path: e.path.join("."),
        message: e.message,
      }));
      return new ValidationError("Validation failed", { errors });
    },
  },

  auth: {
    invalidCredentials: () =>
      new AuthenticationError("Invalid email or password"),

    sessionExpired: () => new AuthenticationError("Session expired"),

    tokenInvalid: () => new AuthenticationError("Invalid token"),

    unauthorized: (action?: string) =>
      new AuthorizationError(`Unauthorized${action ? ` to ${action}` : ""}`),
  },

  business: {
    notFound: (resource: string, id?: string) =>
      new NotFoundError(resource, { id }),

    alreadyExists: (resource: string, field?: string) =>
      new ConflictError(`${resource} already exists`, { field }),

    rateLimit: (retryAfter?: number) => new RateLimitError(retryAfter),
  },

  wrap: (error: unknown): BaseError => {
    if (error instanceof BaseError) {
      return error;
    }

    if (error instanceof Error) {
      return new BaseError(error.message, "UNKNOWN_ERROR");
    }

    return new BaseError("An unknown error occurred", "UNKNOWN_ERROR");
  },
};
```

### Using Error Factory

```typescript
// In commands
export class CreateUserCommand extends BaseCommand {
  async executeImpl(input: CreateUserInput) {
    // Check if user exists
    const existing = await userRepository.findByEmail(input.email);
    if (existing) {
      throw ErrorFactory.business.alreadyExists("User", "email");
    }

    // Validate input
    const validation = schema.safeParse(input);
    if (!validation.success) {
      throw ErrorFactory.validation.fromZod(validation.error);
    }

    // Rate limiting
    const attempts = rateLimiter.get(input.email);
    if (attempts > 5) {
      throw ErrorFactory.business.rateLimit(60);
    }

    // ... rest of implementation
  }
}

// In API routes
export async function POST(request: Request) {
  try {
    const data = await request.json();
    const result = await createUserCommand.execute(data);
    return NextResponse.json(result);
  } catch (error) {
    const baseError = ErrorFactory.wrap(error);

    return NextResponse.json(
      { error: baseError.getUserMessage() },
      { status: baseError.statusCode },
    );
  }
}
```

---

## 🧪 Test Builder Pattern

### Base Test Builder

```typescript
// src/test/builders/base.builder.ts
export abstract class BaseBuilder<T> {
  protected data: Partial<T> = {};

  protected abstract getDefaults(): T;

  build(): T {
    return {
      ...this.getDefaults(),
      ...this.data,
    } as T;
  }

  buildMany(count: number): T[] {
    return Array.from({ length: count }, () => this.build());
  }

  with(overrides: Partial<T>): this {
    this.data = { ...this.data, ...overrides };
    return this;
  }

  reset(): this {
    this.data = {};
    return this;
  }
}
```

### Domain Test Builders

```typescript
// src/test/builders/user.builder.ts
import { faker } from "@faker-js/faker";

export class UserBuilder extends BaseBuilder<User> {
  protected getDefaults(): User {
    return {
      id: faker.datatype.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
      password: faker.internet.password(),
      emailVerified: null,
      image: faker.image.avatar(),
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  withEmail(email: string): this {
    this.data.email = email;
    return this;
  }

  withRole(role: string): this {
    this.data.role = role;
    return this;
  }

  verified(): this {
    this.data.emailVerified = new Date();
    return this;
  }

  admin(): this {
    this.data.role = "admin";
    return this;
  }
}

// src/test/builders/product.builder.ts
export class ProductBuilder extends BaseBuilder<Product> {
  protected getDefaults(): Product {
    return {
      id: faker.datatype.uuid(),
      name: faker.commerce.productName(),
      description: faker.commerce.productDescription(),
      price: parseFloat(faker.commerce.price()),
      stock: faker.datatype.number({ min: 0, max: 100 }),
      category: faker.commerce.department(),
      images: [faker.image.url()],
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  outOfStock(): this {
    this.data.stock = 0;
    return this;
  }

  inactive(): this {
    this.data.active = false;
    return this;
  }

  withPrice(price: number): this {
    this.data.price = price;
    return this;
  }
}
```

### Using Test Builders

```typescript
// In tests
describe("User Service", () => {
  it("should create a user", async () => {
    const userData = new UserBuilder()
      .withEmail("test@example.com")
      .verified()
      .build();

    const user = await userService.create(userData);

    expect(user.email).toBe("test@example.com");
    expect(user.emailVerified).toBeTruthy();
  });

  it("should handle multiple users", async () => {
    const users = new UserBuilder().buildMany(5);

    const results = await Promise.all(users.map((u) => userService.create(u)));

    expect(results).toHaveLength(5);
  });
});
```

---

## 🎯 Integration Examples

### Complete Feature Implementation

```typescript
// Feature: Product Review System

// 1. Command
export class CreateReviewCommand extends BaseCommand<
  CreateReviewInput,
  Review
> {
  async validate(input: CreateReviewInput): Promise<boolean> {
    // Check if user purchased the product
    const purchase = await prisma.order.findFirst({
      where: {
        userId: input.userId,
        items: {
          some: { productId: input.productId },
        },
        status: "delivered",
      },
    });

    return !!purchase;
  }

  protected async executeImpl(input: CreateReviewInput): Promise<Review> {
    const review = await prisma.review.create({
      data: input,
      include: { user: true, product: true },
    });

    // Update product rating
    await this.updateProductRating(input.productId);

    // Emit event
    await eventBus.publish(
      new ReviewCreatedEvent({
        reviewId: review.id,
        productId: input.productId,
        userId: input.userId,
        rating: input.rating,
      }),
    );

    return review;
  }

  private async updateProductRating(productId: string) {
    const stats = await prisma.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: true,
    });

    await prisma.product.update({
      where: { id: productId },
      data: {
        averageRating: stats._avg.rating || 0,
        reviewCount: stats._count,
      },
    });
  }
}

// 2. Repository
export class ReviewRepository extends PrismaRepository<Review> {
  constructor(prisma: PrismaClient) {
    super(prisma, "review");
  }

  async getProductReviews(
    productId: string,
    options: IPaginationOptions = {},
  ): Promise<IPaginatedResult<Review>> {
    return await this.paginate(options, { productId });
  }

  async getUserReviews(
    userId: string,
    options: IPaginationOptions = {},
  ): Promise<IPaginatedResult<Review>> {
    return await this.paginate(options, { userId });
  }

  async hasUserReviewed(userId: string, productId: string): Promise<boolean> {
    const count = await this.prisma.review.count({
      where: { userId, productId },
    });
    return count > 0;
  }
}

// 3. Event Handler
eventBus.subscribe(ReviewCreatedEvent, async (event) => {
  // Send notification to product owner
  const product = await prisma.product.findUnique({
    where: { id: event.payload.productId },
    include: { owner: true },
  });

  if (product?.owner) {
    await notificationService.send({
      userId: product.owner.id,
      title: "New Review",
      message: `Your product received a ${event.payload.rating} star review`,
      type: "review",
    });
  }

  // Update search index
  await searchService.updateProduct(event.payload.productId);
});

// 4. Server Action
export async function createReview(input: CreateReviewInput) {
  try {
    const command = new CreateReviewCommand();
    const review = await command.execute(input);
    return { success: true, data: review };
  } catch (error) {
    const baseError = ErrorFactory.wrap(error);
    return {
      success: false,
      error: baseError.getUserMessage(),
    };
  }
}

// 5. Test
describe("Review System", () => {
  it("should create a review for purchased product", async () => {
    // Setup
    const user = new UserBuilder().verified().build();
    const product = new ProductBuilder().build();
    const order = new OrderBuilder()
      .withUser(user.id)
      .withProduct(product.id)
      .delivered()
      .build();

    // Execute
    const result = await createReview({
      userId: user.id,
      productId: product.id,
      rating: 5,
      comment: "Great product!",
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.data.rating).toBe(5);

    // Verify product rating updated
    const updatedProduct = await prisma.product.findUnique({
      where: { id: product.id },
    });
    expect(updatedProduct.averageRating).toBe(5);
    expect(updatedProduct.reviewCount).toBe(1);
  });
});
```

---

## 📊 Performance Patterns

### Caching Strategy

```typescript
// src/lib/cache/cache.service.ts
import { LRUCache } from "lru-cache";

export class CacheService {
  private cache = new LRUCache<string, any>({
    max: 500,
    ttl: 1000 * 60 * 5, // 5 minutes
  });

  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const cached = this.cache.get(key);
    if (cached) return cached;

    const data = await fetcher();
    this.cache.set(key, data, { ttl });
    return data;
  }

  invalidate(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}

export const cache = new CacheService();

// Usage
const user = await cache.get(
  `user:${userId}`,
  () => userRepository.findById(userId),
  60000, // 1 minute
);
```

### Database Query Optimization

```typescript
// Batch loading
export class DataLoader<T> {
  private batch: Map<string, Promise<T>> = new Map();
  private timer?: NodeJS.Timeout;

  constructor(
    private batchFn: (ids: string[]) => Promise<Map<string, T>>,
    private delay: number = 10,
  ) {}

  async load(id: string): Promise<T> {
    if (!this.batch.has(id)) {
      this.batch.set(
        id,
        new Promise((resolve, reject) => {
          if (!this.timer) {
            this.timer = setTimeout(() => this.flush(), this.delay);
          }
        }),
      );
    }

    return this.batch.get(id)!;
  }

  private async flush() {
    const batch = this.batch;
    this.batch = new Map();
    this.timer = undefined;

    try {
      const ids = Array.from(batch.keys());
      const results = await this.batchFn(ids);

      for (const [id, promise] of batch) {
        const data = results.get(id);
        if (data) {
          (promise as any).resolve(data);
        } else {
          (promise as any).reject(new Error(`Not found: ${id}`));
        }
      }
    } catch (error) {
      for (const [, promise] of batch) {
        (promise as any).reject(error);
      }
    }
  }
}

// Usage
const userLoader = new DataLoader<User>(async (ids) => {
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
  });
  return new Map(users.map((u) => [u.id, u]));
});

// Will batch these requests
const [user1, user2, user3] = await Promise.all([
  userLoader.load("id1"),
  userLoader.load("id2"),
  userLoader.load("id3"),
]);
```

---

## 🚀 Quick Integration Checklist

### Phase 1: Foundation (1-2 hours)

- [ ] Copy command pattern base files
- [ ] Copy event system base files
- [ ] Copy error factory
- [ ] Set up basic folder structure

### Phase 2: Core Patterns (2-4 hours)

- [ ] Implement first command
- [ ] Set up event bus
- [ ] Create first repository
- [ ] Add error handling

### Phase 3: Testing (2-3 hours)

- [ ] Add test builders
- [ ] Create test utilities
- [ ] Write first integration test
- [ ] Set up test database

### Phase 4: Integration (2-3 hours)

- [ ] Connect to existing features
- [ ] Migrate existing code gradually
- [ ] Add monitoring/logging
- [ ] Update documentation

---

## 📚 Additional Resources

- [Command Pattern Deep Dive](https://refactoring.guru/design-patterns/command)
- [Event-Driven Architecture Guide](https://martinfowler.com/articles/201701-event-driven.html)
- [Repository Pattern Best Practices](https://docs.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design)
- [Error Handling in Node.js](https://www.joyent.com/node-js/production/design/errors)

---

**Ready to enhance your project with enterprise patterns!** 🎯
