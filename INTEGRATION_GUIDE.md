# 🔧 Next.js Auth + i18n Integration Guide

## Purpose & Usage Scenarios

This guide provides comprehensive instructions for three primary use cases:
1. **Starting Fresh**: Using as a complete starter template
2. **Enhancing Existing**: Adding auth + i18n to your current project
3. **Learning Reference**: Understanding patterns and implementations

---

## 📋 Table of Contents

- [Decision Flowchart](#decision-flowchart)
- [Method 1: Complete Starter Template](#method-1-complete-starter-template)
- [Method 2: Enhance Existing Project](#method-2-enhance-existing-project)
- [Method 3: Reference Implementation](#method-3-reference-implementation)
- [Core Components Breakdown](#core-components-breakdown)
- [Migration Strategies](#migration-strategies)
- [Pattern Implementation Guide](#pattern-implementation-guide)
- [Troubleshooting Guide](#troubleshooting-guide)

---

## Decision Flowchart

```
Start Here
    │
    ├─ Do you have an existing Next.js project?
    │   │
    │   ├─ NO → Use Method 1: Complete Starter Template
    │   │
    │   └─ YES → What do you need?
    │       │
    │       ├─ Auth + i18n + Architecture → Use Method 2: Full Enhancement
    │       │
    │       ├─ Just Auth → Use Method 2: Section A (Auth Only)
    │       │
    │       ├─ Just i18n → Use Method 2: Section B (i18n Only)
    │       │
    │       └─ Learn Patterns → Use Method 3: Reference Guide
```

---

## Method 1: Complete Starter Template

### When to Use
- Starting a new project from scratch
- Need auth + i18n + testing infrastructure
- Want enterprise patterns from day one

### Step-by-Step Setup

#### Phase 1: Initial Setup
```bash
# 1.1 Clone and prepare
git clone https://github.com/yourusername/nextjs-auth-app.git my-new-app
cd my-new-app
rm -rf .git
git init

# 1.2 Update package.json
# Edit name, description, author
```

#### Phase 2: Customize Configuration
```javascript
// 1. Update src/config/i18n.ts
export const locales = ['en', 'es', 'fr'] // Your languages
export const defaultLocale = 'en'

// 2. Update src/lib/auth-config.ts
export const authConfig = {
  providers: [
    // Add/remove providers
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    // Add more providers as needed
  ],
}

// 3. Update prisma/schema.prisma for your domain
model User {
  // Add your custom fields
  organization String?
  role         String   @default("user")
  // Keep existing auth fields
}
```

#### Phase 3: Environment Setup
```env
# .env.local
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
GOOGLE_CLIENT_ID=your-google-id
GOOGLE_CLIENT_SECRET=your-google-secret
```

#### Phase 4: Database & Dependencies
```bash
# 4.1 Install dependencies
pnpm install

# 4.2 Start database
pnpm docker:up

# 4.3 Push schema
pnpm prisma:push

# 4.4 Start development
pnpm dev
```

#### Phase 5: Customize for Your Domain
```typescript
// Create your own commands in src/lib/commands/
export class CreateOrganizationCommand extends BaseCommand {
  async execute(input: CreateOrgInput): Promise<ActionResponse> {
    // Your business logic
  }
}

// Create your events in src/lib/events/domain/
export class OrganizationCreatedEvent extends BaseEvent {
  constructor(public payload: OrgCreatedPayload) {
    super('organization.created', payload)
  }
}
```

---

## Method 2: Enhance Existing Project

### Prerequisites Check
```javascript
// Your project should have:
{
  "dependencies": {
    "next": "^15.0.0",    // Next.js 15+
    "react": "^18.0.0",    // React 18+
    "typescript": "^5.0.0" // TypeScript 5+
  }
}
```

### Section A: Adding Authentication

#### Step A1: Install Dependencies
```bash
pnpm add next-auth@beta @auth/prisma-adapter prisma @prisma/client
pnpm add bcryptjs @types/bcryptjs
pnpm add zod
```

#### Step A2: Copy Core Auth Files
```
Files to copy:
├── src/lib/
│   ├── auth.ts              # NextAuth configuration
│   ├── auth-config.ts       # Auth providers setup
│   ├── database.ts          # Prisma client
│   └── types/prisma.ts      # Type exports
├── src/app/api/auth/
│   └── [...nextauth]/
│       └── route.ts          # Auth API route
├── prisma/
│   └── schema.prisma         # Database schema
└── middleware.ts             # Auth middleware
```

#### Step A3: Integrate Auth Components
```typescript
// 1. Update your root layout
import { auth } from '@/lib/auth'
import { SessionProvider } from 'next-auth/react'

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  
  return (
    <html>
      <body>
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}

// 2. Create protected routes
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function ProtectedPage() {
  const session = await auth()
  
  if (!session) {
    redirect('/login')
  }
  
  return <div>Protected content</div>
}
```

#### Step A4: Copy Auth Components
```
Components to integrate:
├── src/components/auth/
│   ├── login-form.tsx       # Login component
│   ├── registration-form.tsx # Registration component
│   └── user-button.tsx      # User menu
```

### Section B: Adding Internationalization

#### Step B1: Install i18n Dependencies
```bash
pnpm add next-intl
```

#### Step B2: Copy i18n Configuration
```
Files to copy:
├── src/
│   ├── i18n.ts              # i18n configuration
│   ├── config/i18n.ts       # Locale settings
│   └── middleware.ts         # i18n middleware
├── messages/
│   ├── en.json              # English translations
│   ├── es.json              # Spanish translations
│   └── [other locales].json
```

#### Step B3: Restructure App Directory
```
Before:
src/app/
├── page.tsx
├── dashboard/
└── profile/

After:
src/app/
└── [locale]/
    ├── page.tsx
    ├── dashboard/
    └── profile/
```

#### Step B4: Update Components for i18n
```typescript
// 1. Server components
import { getTranslations } from 'next-intl/server'

export default async function Page({
  params: { locale }
}: {
  params: { locale: string }
}) {
  const t = await getTranslations('Home')
  
  return <h1>{t('title')}</h1>
}

// 2. Client components
'use client'
import { useTranslations } from 'next-intl'

export function Component() {
  const t = useTranslations('Component')
  
  return <button>{t('action')}</button>
}
```

### Section C: Adding Enterprise Patterns

#### Step C1: Command Pattern Implementation
```typescript
// 1. Copy command infrastructure
src/lib/commands/
├── base/
│   ├── command.base.ts
│   ├── command.interface.ts
│   └── command-bus.ts

// 2. Create your commands
export class YourCommand extends BaseCommand {
  async validate(input: Input): Promise<boolean> {
    // Validation logic
    return true
  }
  
  async execute(input: Input): Promise<ActionResponse> {
    // Business logic
    return createSuccessResponse('Done!')
  }
  
  async undo(): Promise<void> {
    // Rollback logic
  }
}

// 3. Use in your actions
export async function yourAction(input: Input) {
  const command = new YourCommand()
  return await command.execute(input)
}
```

#### Step C2: Event System Integration
```typescript
// 1. Copy event infrastructure
src/lib/events/
├── base/
│   ├── event.base.ts
│   ├── event.interface.ts
│   └── event-bus.ts

// 2. Create domain events
export class YourEvent extends BaseEvent {
  constructor(payload: YourPayload) {
    super('your.event.name', payload)
  }
}

// 3. Publish events
await eventBus.publish(new YourEvent({
  id: '123',
  timestamp: new Date()
}))

// 4. Subscribe to events
eventBus.subscribe(YourEvent, async (event) => {
  console.log('Event received:', event)
  // Handle event
})
```

#### Step C3: Repository Pattern
```typescript
// 1. Copy repository infrastructure
src/lib/repositories/
├── base/
│   ├── repository.interface.ts
│   └── prisma.repository.ts

// 2. Create your repositories
export class YourRepository implements IRepository<YourEntity> {
  async findById(id: string): Promise<YourEntity | null> {
    return await prisma.yourEntity.findUnique({
      where: { id }
    })
  }
  
  async create(data: CreateDTO): Promise<YourEntity> {
    return await prisma.yourEntity.create({ data })
  }
}

// 3. Use with dependency injection
const repo = new YourRepository()
const entity = await repo.findById('123')
```

---

## Method 3: Reference Implementation

### Understanding the Architecture

#### Core Concepts Map
```
Authentication (NextAuth v5)
├── JWT Strategy
├── Dual Providers (OAuth + Credentials)
├── Session Management
└── Protected Routes

Internationalization (next-intl)
├── Server-side Translations
├── Client-side Hooks
├── Locale Routing
└── Type-safe Messages

Enterprise Patterns
├── Command Pattern (Business Operations)
├── Event System (Decoupled Communication)
├── Repository Pattern (Data Access)
├── Error Factory (Centralized Errors)
└── Test Builders (Test Data)
```

### Key Files to Study

#### Authentication Flow
```typescript
// 1. Configuration: src/lib/auth-config.ts
// Learn: Provider setup, callbacks, JWT configuration

// 2. Middleware: middleware.ts
// Learn: Route protection, session validation

// 3. Components: src/components/auth/
// Learn: Form handling, OAuth integration

// 4. Database: prisma/schema.prisma
// Learn: User model, account linking
```

#### i18n Implementation
```typescript
// 1. Configuration: src/i18n.ts
// Learn: Locale setup, message loading

// 2. Routing: src/app/[locale]/
// Learn: Dynamic routing, locale extraction

// 3. Components: src/components/
// Learn: Translation usage patterns

// 4. Validation: src/lib/validation/
// Learn: Localized error messages
```

#### Testing Patterns
```typescript
// 1. Builders: src/test/builders/
// Learn: Test data creation patterns

// 2. Page Objects: e2e/pages/
// Learn: E2E test organization

// 3. Mocks: src/test/mocks/
// Learn: Dependency mocking

// 4. Integration: src/test/integration/
// Learn: Database testing
```

---

## Core Components Breakdown

### Essential Files Matrix

| Component | Files | Purpose | Dependencies |
|-----------|-------|---------|--------------|
| **Auth Core** | `lib/auth.ts`, `lib/auth-config.ts` | NextAuth setup | next-auth, prisma |
| **Database** | `lib/database.ts`, `prisma/schema.prisma` | Data layer | @prisma/client |
| **Middleware** | `middleware.ts` | Route protection | next-auth, next-intl |
| **i18n Core** | `i18n.ts`, `config/i18n.ts` | Translations | next-intl |
| **Commands** | `lib/commands/base/*` | Business logic | Custom pattern |
| **Events** | `lib/events/base/*` | Event system | Custom pattern |
| **Errors** | `lib/errors/*` | Error handling | Custom pattern |
| **Testing** | `test/*`, `e2e/*` | Test infrastructure | jest, playwright |

### Copy Priority Order

1. **Minimal Auth**: auth.ts, auth-config.ts, database.ts, schema.prisma
2. **Minimal i18n**: i18n.ts, messages/*, middleware.ts
3. **Full Auth**: + components/auth/*, lib/actions/auth.ts
4. **Full i18n**: + config/i18n.ts, utils/get-locale.ts
5. **Enterprise**: + commands/*, events/*, repositories/*
6. **Testing**: + test/*, e2e/*, jest.config.js

---

## Migration Strategies

### Strategy 1: Gradual Migration (Recommended)

#### Phase 1: Foundation (Week 1)
```bash
# 1. Create feature branch
git checkout -b feature/add-auth-i18n

# 2. Add core dependencies
pnpm add next-auth@beta next-intl prisma

# 3. Copy minimal files
cp -r [source]/lib/auth* ./src/lib/
cp -r [source]/prisma ./

# 4. Test basic auth
pnpm dev
```

#### Phase 2: Components (Week 2)
```bash
# 1. Copy UI components
cp -r [source]/components/auth ./src/components/
cp -r [source]/components/ui ./src/components/

# 2. Integrate with existing UI
# Update your existing components to use auth

# 3. Test integration
pnpm test
```

#### Phase 3: i18n (Week 3)
```bash
# 1. Copy translations
cp -r [source]/messages ./

# 2. Restructure routes
mkdir -p src/app/[locale]
mv src/app/* src/app/[locale]/

# 3. Update imports and paths
```

#### Phase 4: Patterns (Week 4)
```bash
# 1. Copy enterprise patterns
cp -r [source]/lib/commands ./src/lib/
cp -r [source]/lib/events ./src/lib/

# 2. Refactor existing logic to use patterns
# Gradually migrate business logic to commands
```

### Strategy 2: Big Bang Migration

#### Prerequisites
- Complete test coverage of existing functionality
- Feature freeze during migration
- Rollback plan ready

#### Steps
```bash
# 1. Create migration branch
git checkout -b major/auth-i18n-migration

# 2. Copy all infrastructure at once
cp -r [source]/src/lib ./src/
cp -r [source]/src/components ./src/
cp -r [source]/prisma ./
cp -r [source]/messages ./

# 3. Update all imports and configurations

# 4. Run comprehensive tests
pnpm test:all

# 5. Deploy to staging first
```

---

## Pattern Implementation Guide

### Command Pattern Recipe

```typescript
// 1. Define input interface
interface CreateProductInput {
  name: string
  price: number
  description?: string
}

// 2. Create command class
export class CreateProductCommand extends BaseCommand<
  CreateProductInput,
  ActionResponse
> {
  async validate(input: CreateProductInput): Promise<boolean> {
    const schema = z.object({
      name: z.string().min(1),
      price: z.number().positive(),
      description: z.string().optional()
    })
    
    return schema.safeParse(input).success
  }
  
  async execute(
    input: CreateProductInput,
    metadata?: CommandMetadata
  ): Promise<ActionResponse> {
    try {
      // Validate
      if (!await this.validate(input)) {
        return createErrorResponse('Validation failed')
      }
      
      // Execute business logic
      const product = await prisma.product.create({
        data: input
      })
      
      // Emit event
      await eventBus.publish(new ProductCreatedEvent({
        productId: product.id,
        name: product.name
      }))
      
      // Return response
      return createSuccessResponse('Product created', {
        id: product.id
      })
    } catch (error) {
      return createErrorResponse('Failed to create product')
    }
  }
}

// 3. Use in server action
export async function createProduct(input: CreateProductInput) {
  const command = new CreateProductCommand()
  return await command.execute(input)
}
```

### Event System Recipe

```typescript
// 1. Define event
export class OrderPlacedEvent extends BaseEvent {
  constructor(
    public payload: {
      orderId: string
      userId: string
      total: number
      items: OrderItem[]
    }
  ) {
    super('order.placed', payload)
  }
}

// 2. Register handlers
eventBus.subscribe(OrderPlacedEvent, async (event) => {
  // Send confirmation email
  await emailService.send({
    to: event.payload.userId,
    template: 'order-confirmation',
    data: event.payload
  })
})

eventBus.subscribe(OrderPlacedEvent, async (event) => {
  // Update inventory
  for (const item of event.payload.items) {
    await inventoryService.decreaseStock(
      item.productId,
      item.quantity
    )
  }
})

eventBus.subscribe(OrderPlacedEvent, async (event) => {
  // Analytics tracking
  await analytics.track('Order Placed', {
    orderId: event.payload.orderId,
    value: event.payload.total
  })
})

// 3. Publish event
await eventBus.publish(new OrderPlacedEvent({
  orderId: '123',
  userId: 'user-456',
  total: 99.99,
  items: [...]
}))
```

### Repository Pattern Recipe

```typescript
// 1. Define interface
export interface IProductRepository {
  findById(id: string): Promise<Product | null>
  findByCategory(category: string): Promise<Product[]>
  create(data: CreateProductDTO): Promise<Product>
  update(id: string, data: UpdateProductDTO): Promise<Product>
  delete(id: string): Promise<boolean>
}

// 2. Implement repository
export class ProductRepository implements IProductRepository {
  async findById(id: string): Promise<Product | null> {
    return await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        reviews: true
      }
    })
  }
  
  async findByCategory(category: string): Promise<Product[]> {
    return await prisma.product.findMany({
      where: {
        category: {
          name: category
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  }
  
  async create(data: CreateProductDTO): Promise<Product> {
    return await prisma.product.create({
      data,
      include: {
        category: true
      }
    })
  }
  
  // ... other methods
}

// 3. Use with dependency injection
export class ProductService {
  constructor(
    private repository: IProductRepository = new ProductRepository()
  ) {}
  
  async getProduct(id: string) {
    const product = await this.repository.findById(id)
    if (!product) {
      throw new NotFoundError('Product not found')
    }
    return product
  }
}
```

---

## Troubleshooting Guide

### Common Integration Issues

#### Issue 1: TypeScript Errors After Copying Files
```typescript
// Problem: Missing types or mismatched versions
// Solution: Ensure versions match
{
  "dependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0"
  }
}

// Generate Prisma types
pnpm prisma generate
```

#### Issue 2: Middleware Conflicts
```typescript
// Problem: Multiple middlewares conflicting
// Solution: Combine middlewares properly

import { NextResponse } from 'next/server'
import { auth } from './lib/auth'
import { i18nMiddleware } from './lib/i18n'

export async function middleware(request: NextRequest) {
  // Run i18n first
  const i18nResponse = i18nMiddleware(request)
  if (i18nResponse) return i18nResponse
  
  // Then auth
  const session = await auth()
  if (!session && request.nextUrl.pathname.startsWith('/protected')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  
  return NextResponse.next()
}
```

#### Issue 3: Database Connection Issues
```bash
# Problem: Can't connect to database
# Solution: Check DATABASE_URL format

# PostgreSQL
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"

# With Docker
DATABASE_URL="postgresql://postgres:postgres123@localhost:5433/nextjs_auth_db"

# Test connection
pnpm prisma db pull
```

#### Issue 4: OAuth Callback URLs
```typescript
// Problem: OAuth redirect mismatch
// Solution: Update callback URLs

// Google Console
// Authorized redirect URIs:
// - http://localhost:3000/api/auth/callback/google
// - https://yourdomain.com/api/auth/callback/google

// In .env.local
NEXTAUTH_URL=http://localhost:3000  // Must match exactly
```

#### Issue 5: Translation Keys Missing
```typescript
// Problem: Missing translation keys
// Solution: Add fallback

import { getTranslations } from 'next-intl/server'

try {
  const t = await getTranslations('Component')
  return t('key')
} catch {
  // Fallback to English
  const tEn = await getTranslations({
    locale: 'en',
    namespace: 'Component'
  })
  return tEn('key')
}
```

### Performance Optimization Tips

#### 1. Lazy Load Translations
```typescript
// Only load needed namespaces
const t = await getTranslations('Dashboard')  // Not all translations
```

#### 2. Cache Auth Sessions
```typescript
import { unstable_cache } from 'next/cache'

const getCachedSession = unstable_cache(
  async () => auth(),
  ['session'],
  { revalidate: 60 }  // Cache for 60 seconds
)
```

#### 3. Optimize Prisma Queries
```typescript
// Use select to limit fields
const user = await prisma.user.findUnique({
  where: { id },
  select: {
    id: true,
    name: true,
    email: true
    // Only fields you need
  }
})
```

---

## Quick Reference Checklist

### For New Projects
- [ ] Clone repository
- [ ] Update package.json metadata
- [ ] Configure environment variables
- [ ] Set up database
- [ ] Customize locales
- [ ] Add OAuth providers
- [ ] Update Prisma schema
- [ ] Run tests
- [ ] Deploy

### For Existing Projects
- [ ] Backup current project
- [ ] Install dependencies
- [ ] Copy core files
- [ ] Update middleware
- [ ] Restructure app directory
- [ ] Migrate components
- [ ] Update imports
- [ ] Test thoroughly
- [ ] Deploy to staging

### For Learning
- [ ] Study auth flow
- [ ] Understand middleware chain
- [ ] Learn command pattern
- [ ] Explore event system
- [ ] Review test patterns
- [ ] Analyze error handling
- [ ] Study i18n implementation

---

## Additional Resources

### Documentation Links
- [Next.js 15 Docs](https://nextjs.org/docs)
- [NextAuth.js v5 Beta](https://authjs.dev/)
- [next-intl Guide](https://next-intl-docs.vercel.app/)
- [Prisma Documentation](https://www.prisma.io/docs)

### Example Implementations
- Authentication flows: `src/lib/actions/auth.ts`
- i18n patterns: `src/app/[locale]/page.tsx`
- Command examples: `src/lib/commands/auth/*.ts`
- Event handlers: `src/lib/events/handlers/*.ts`
- Test patterns: `src/test/unit/__tests__/*.ts`

### Support Channels
- GitHub Issues: Report bugs and request features
- Discord: Community support
- Stack Overflow: Tag with `nextjs-auth-i18n`

---

*This guide is structured for both human comprehension and systematic parsing. Each section is self-contained with clear dependencies and outcomes.*