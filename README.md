# Next.js Authentication App

A minimal, production-ready Next.js 15 application with Google OAuth authentication, PostgreSQL database, and multi-language support.

## 🚀 Tech Stack

- **Next.js 15.4.5** - App Router with Server Components
- **NextAuth.js 5.0.0-beta.29** - Latest beta with JWT sessions and dual authentication
- **Prisma 6.13.0** - Type-safe database ORM
- **PostgreSQL 16** - Database with Docker
- **next-intl 4.3.4** - Internationalization (EN/ES/FR/IT/DE)
- **Tailwind CSS 3.4.16** - Styling framework (v4 downgraded for stability)
- **TypeScript 5.8.3** - Type safety

## 📋 Prerequisites

- Node.js 18+ and pnpm
- Docker and Docker Compose
- Google OAuth credentials
- bcryptjs for password hashing

## ✅ Recent Improvements

- **Dual Authentication**: Added email/password credentials alongside Google OAuth
- **JWT Strategy**: Switched to JWT sessions to support credentials provider
- **Multi-language Support**: Added Italian and German translations (5 languages total)
- **Security**: Password hashing with bcryptjs, proper session handling
- **Fixed Edge Runtime Errors**: Middleware now only handles i18n, auth checks moved to page level
- **Production Ready**: Debug mode disabled in production, proper environment configuration

## 🛠️ Setup Instructions

### 1. Clone and Install

```bash
cd nextjs-auth-app
pnpm install
```

### 2. Environment Setup

Copy `.env.example` to `.env.local` and update with your Google OAuth credentials:

```env
GOOGLE_CLIENT_ID="your-actual-client-id"
GOOGLE_CLIENT_SECRET="your-actual-client-secret"
```

### 3. Database Setup

```bash
# Start PostgreSQL with Docker
pnpm docker:up

# Push database schema
pnpm prisma:push

# (Optional) Open Prisma Studio
pnpm prisma:studio
```

### 4. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`

### 5. Start Development Server

```bash
pnpm dev
```

Visit http://localhost:3000

## 📁 Project Structure

```
src/
├── app/
│   ├── [locale]/         # Internationalized routes
│   │   ├── layout.tsx    # Root layout with providers
│   │   ├── page.tsx      # Home page
│   │   └── dashboard/    # Protected dashboard
│   ├── api/
│   │   └── auth/         # NextAuth API routes
│   └── globals.css       # Global styles
├── components/
│   └── auth/             # Auth components
├── lib/
│   ├── auth.ts          # NextAuth configuration
│   └── prisma.ts        # Prisma client
├── middleware.ts         # Auth + i18n middleware
└── i18n.ts              # Internationalization config
```

## 🔧 Available Scripts

```bash
pnpm dev          # Start development server
pnpm build        # Build for production
pnpm start        # Start production server
pnpm start:prod   # Start with NODE_ENV=production (no debug warnings)
pnpm lint         # Run ESLint
pnpm typecheck    # Run TypeScript type checking
pnpm docker:up    # Start Docker containers
pnpm docker:down  # Stop Docker containers
pnpm docker:logs  # View Docker container logs
pnpm db:setup     # Setup database (generate + push)
pnpm prisma:studio # Open Prisma Studio GUI
pnpm create-user    # Create test user for credentials auth
```

## 🌍 Internationalization

The app supports five languages:
- English (en) - Default
- Spanish (es)
- French (fr)
- Italian (it)
- German (de)

Language can be changed using the dropdown in the navigation bar.

## 🔒 Authentication Flow

### Google OAuth
1. User clicks "Sign in with Google"
2. Redirected to Google OAuth
3. After approval, redirected back to app
4. JWT session created
5. Protected routes accessible

### Email/Password Credentials
1. User enters email and password
2. Password verified with bcrypt
3. JWT session created
4. Protected routes accessible

### Creating Test Users
```bash
pnpm create-user
# Creates test@example.com with password: password123
```

## 🐛 Troubleshooting

### Port Conflicts
If port 5432 is in use, the Docker setup uses port 5433 instead.

### Prisma Errors
```bash
# Regenerate Prisma client
pnpm prisma:generate

# Reset database
pnpm prisma:push --force-reset
```

### Authentication Issues
- Ensure Google OAuth credentials are correct
- Check redirect URIs match exactly
- Verify `NEXTAUTH_SECRET` is set

## 📝 Best Practices Implemented

1. **Security**
   - Environment variables for secrets
   - JWT sessions with secure tokens
   - Password hashing with bcryptjs (12 rounds)
   - CSRF protection via NextAuth
   - Secure middleware implementation

2. **Performance**
   - Server Components by default
   - Optimized Docker builds
   - Database connection pooling
   - Proper indexing on database

3. **Developer Experience**
   - TypeScript strict mode
   - Consistent file structure
   - Clear separation of concerns
   - Comprehensive error handling

4. **Production Ready**
   - Docker containerization
   - Environment-specific configs
   - Proper logging setup
   - Health check endpoints

## 🚀 Deployment

For production deployment:

1. Update environment variables
2. Use a proper `NEXTAUTH_SECRET` (generate with `openssl rand -base64 32`)
3. Update `NEXTAUTH_URL` to your production URL
4. Use managed PostgreSQL service
5. Configure proper domain and SSL

## 📄 License

MIT