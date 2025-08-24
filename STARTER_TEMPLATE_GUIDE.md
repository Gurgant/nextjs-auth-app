# 🚀 QUICK START: Using as a Starter Template

## 📋 5-Minute Setup Guide

### Prerequisites Checklist

- [ ] Node.js 18+ installed
- [ ] pnpm 8+ installed (`npm install -g pnpm`)
- [ ] Docker Desktop installed and running
- [ ] Git configured

### Step 1: Clone & Initialize (1 minute)

```bash
# Clone the template
git clone https://github.com/yourusername/nextjs-auth-app.git my-awesome-app
cd my-awesome-app

# Remove template history
rm -rf .git
git init
git add .
git commit -m "Initial commit from nextjs-auth-app template"
```

### Step 2: Configure Project Identity (1 minute)

```bash
# Update package.json
pnpm pkg set name="my-awesome-app"
pnpm pkg set description="My awesome application with auth and i18n"
pnpm pkg set author="Your Name <you@example.com>"
```

### Step 3: Environment Setup (1 minute)

```bash
# Copy environment template
cp .env.example .env.local

# Generate secrets
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)" >> .env.local
echo "AUTH_SECRET=$(openssl rand -base64 32)" >> .env.local
```

### Step 4: Database Setup (1 minute)

```bash
# Start PostgreSQL with Docker
pnpm docker:up

# Wait 5 seconds for PostgreSQL to initialize
sleep 5

# Push database schema
pnpm prisma:push
```

### Step 5: Launch! (1 minute)

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

🎉 **Visit http://localhost:3000** - Your app is ready!

---

## 🎨 Customization Checklist

### Immediate Customizations (Day 1)

#### 1. Branding

```typescript
// src/app/[locale]/layout.tsx
export const metadata = {
  title: "My Awesome App",
  description: "Your app description",
};

// Update logo in src/components/ui/logo.tsx
```

#### 2. Language Configuration

```typescript
// src/config/i18n.ts
export const locales = ["en", "es"]; // Remove unused languages
export const defaultLocale = "en";

// Delete unused translation files:
// rm messages/fr.json messages/it.json messages/de.json
```

#### 3. Authentication Providers

```typescript
// src/lib/auth-config.ts
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";

export const authConfig = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    // Add GitHub provider
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
};
```

### Week 1 Customizations

#### 1. User Model Extensions

```prisma
// prisma/schema.prisma
model User {
  // ... existing fields ...

  // Add your domain-specific fields
  organization    String?
  department      String?
  phoneNumber     String?
  bio             String?
  avatarUrl       String?
  preferences     Json?
  subscription    Subscription?
}

model Subscription {
  id        String   @id @default(cuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id])
  plan      String   @default("free")
  startDate DateTime @default(now())
  endDate   DateTime?
}
```

Run `pnpm prisma:push` after schema changes.

#### 2. Custom Commands

```typescript
// src/lib/commands/subscription/create-subscription.command.ts
import { BaseCommand } from "../base/command.base";

export class CreateSubscriptionCommand extends BaseCommand {
  async execute(input: CreateSubscriptionInput): Promise<ActionResponse> {
    try {
      const subscription = await prisma.subscription.create({
        data: {
          userId: input.userId,
          plan: input.plan,
          endDate: this.calculateEndDate(input.plan),
        },
      });

      await eventBus.publish(
        new SubscriptionCreatedEvent({
          subscriptionId: subscription.id,
          userId: input.userId,
          plan: input.plan,
        }),
      );

      return createSuccessResponse("Subscription created", subscription);
    } catch (error) {
      return createErrorResponse("Failed to create subscription");
    }
  }
}
```

#### 3. Custom Events

```typescript
// src/lib/events/domain/subscription.events.ts
export class SubscriptionCreatedEvent extends BaseEvent {
  constructor(payload: SubscriptionPayload) {
    super("subscription.created", payload);
  }
}

// Register handlers
eventBus.subscribe(SubscriptionCreatedEvent, async (event) => {
  // Send welcome email
  await emailService.sendSubscriptionWelcome(event.payload);

  // Update analytics
  await analytics.track("Subscription Created", event.payload);
});
```

---

## 🏗️ Project Structure Guide

### Core Directories to Modify

```
src/
├── app/[locale]/           # Your pages go here
│   ├── dashboard/          # Add your app routes
│   ├── settings/
│   └── your-feature/
├── components/             # Your UI components
│   ├── your-domain/        # Domain-specific components
│   └── shared/             # Shared components
├── lib/
│   ├── commands/           # Your business logic
│   │   └── your-domain/    # Domain commands
│   ├── events/
│   │   └── your-domain/    # Domain events
│   └── repositories/
│       └── your-domain/    # Data access
```

### Files to Keep As-Is

- ✅ Authentication system (`src/lib/auth*`)
- ✅ Middleware (`middleware.ts`)
- ✅ Error handling (`src/lib/errors/*`)
- ✅ Test infrastructure (`src/test/*`)
- ✅ i18n configuration (`src/i18n.ts`)

### Files to Customize

- 🎨 Layout files (`app/[locale]/layout.tsx`)
- 🎨 Homepage (`app/[locale]/page.tsx`)
- 🎨 UI components (`src/components/ui/*`)
- 🎨 Email templates (`src/lib/email/templates/*`)

---

## 🔧 Common Setup Scenarios

### Scenario 1: SaaS Application

```bash
# 1. Add Stripe
pnpm add stripe @stripe/stripe-js

# 2. Add subscription model to schema
# 3. Create billing commands
# 4. Add webhook handlers
```

### Scenario 2: Multi-tenant Application

```bash
# 1. Add tenant model to schema
# 2. Update middleware for tenant isolation
# 3. Add tenant-scoped repositories
# 4. Update user registration flow
```

### Scenario 3: API-First Application

```bash
# 1. Add API documentation
pnpm add @scalar/nextjs

# 2. Create API routes
# 3. Add rate limiting
# 4. Implement API keys
```

---

## 📦 Deployment Quick Start

### Vercel (Recommended)

```bash
# 1. Install Vercel CLI
pnpm add -g vercel

# 2. Deploy
vercel

# 3. Add environment variables in Vercel dashboard
```

### Docker

```bash
# 1. Build image
docker build -t my-app .

# 2. Run container
docker run -p 3000:3000 --env-file .env.production my-app
```

### Traditional VPS

```bash
# 1. Build for production
pnpm build

# 2. Start with PM2
pm2 start npm --name "my-app" -- start
```

---

## ⚡ Performance Optimizations

### Day 1 Optimizations

```typescript
// 1. Enable static generation where possible
export const dynamic = "force-static"; // In pages without auth

// 2. Use proper caching
export const revalidate = 3600; // 1 hour

// 3. Optimize images
import Image from "next/image";
```

### Production Optimizations

```typescript
// 1. Database connection pooling
// Already configured in prisma/schema.prisma

// 2. Redis for sessions (optional)
// pnpm add redis @upstash/redis

// 3. CDN for static assets
// Configure in next.config.js
```

---

## 🔍 Testing Your Setup

### Quick Smoke Test

```bash
# 1. Run all tests
pnpm test

# 2. Check TypeScript
pnpm typecheck

# 3. Lint code
pnpm lint

# Expected: All green! ✅
```

### Manual Testing Checklist

- [ ] Registration works
- [ ] Login works
- [ ] Password reset works
- [ ] Language switching works
- [ ] Protected routes redirect properly
- [ ] OAuth login works (if configured)

---

## 🆘 Troubleshooting

### Common Issues & Solutions

#### Database Connection Failed

```bash
# Check Docker is running
docker ps

# Restart PostgreSQL
pnpm docker:down
pnpm docker:up

# Check connection string
echo $DATABASE_URL
```

#### TypeScript Errors

```bash
# Regenerate Prisma types
pnpm prisma:generate

# Clear TypeScript cache
rm -rf tsconfig.tsbuildinfo
pnpm typecheck
```

#### OAuth Not Working

```bash
# Verify callback URL
# Must be: http://localhost:3000/api/auth/callback/[provider]

# Check environment variables
grep GOOGLE .env.local
```

---

## 📚 What's Included

### ✅ Pre-configured Features

- NextAuth v5 with JWT
- Dual authentication (OAuth + Credentials)
- 5-language internationalization
- Complete test suite (314 tests)
- Enterprise error handling
- Command & Event patterns
- Repository pattern
- Rate limiting
- Password security
- Email templates
- Docker setup

### 🎁 Bonus Tools

- Test data builders
- Page Object Model for E2E
- Performance testing setup
- Production readiness checker
- Translation validator
- User creation script

---

## 🚦 Go-Live Checklist

### Before First Deploy

- [ ] Update all environment variables
- [ ] Configure OAuth providers
- [ ] Set up error monitoring (Sentry)
- [ ] Configure email service
- [ ] Update privacy policy URL
- [ ] Update terms of service URL
- [ ] Set up database backups
- [ ] Configure SSL certificate

### After Deploy

- [ ] Test registration flow
- [ ] Test login flow
- [ ] Test password reset
- [ ] Verify email sending
- [ ] Check all languages
- [ ] Monitor error logs
- [ ] Set up uptime monitoring

---

## 💡 Pro Tips

1. **Keep the test suite**: The 314 tests are your safety net
2. **Use the patterns**: Command/Event/Repository patterns scale well
3. **Don't remove i18n**: Even for single language, the infrastructure is valuable
4. **Leverage TypeScript**: The strict typing prevents many bugs
5. **Use the error factory**: Consistent error handling saves debugging time

---

## 🎯 Next Steps

1. **Customize branding** (30 mins)
2. **Add your first feature** (2 hours)
3. **Deploy to staging** (1 hour)
4. **Configure monitoring** (1 hour)
5. **Go live!** 🚀

---

**Need help?** Check the [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) for detailed instructions or raise an issue on GitHub.

**Ready to build something awesome!** 🎉
