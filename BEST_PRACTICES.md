# 🏆 Best Practices Guide

## 📋 Development Best Practices

### 1. **Authentication Security**

#### ✅ DO:
```typescript
// Store sensitive data in environment variables
const clientId = process.env.GOOGLE_CLIENT_ID!

// Use database sessions for better security
session: { strategy: 'database' }

// Always validate user input
if (!session?.user) redirect('/')
```

#### ❌ DON'T:
```typescript
// Never hardcode secrets
const clientId = "809010324332-..." // BAD!

// Avoid JWT in cookies for sensitive apps
session: { strategy: 'jwt' } // Less secure

// Don't trust client-side data
const userId = req.body.userId // Unsafe!
```

### 2. **Edge Runtime Compatibility**

#### ✅ DO:
```typescript
// Keep middleware lightweight
export default function middleware(req: NextRequest) {
  // Only i18n logic here
  return intlMiddleware(req)
}

// Handle auth in Server Components
export default async function ProtectedPage() {
  const session = await auth()
  if (!session) redirect('/')
}
```

#### ❌ DON'T:
```typescript
// Don't use Node.js APIs in middleware
export default auth((req) => {
  // Prisma doesn't work here!
  const user = await prisma.user.findUnique()
})
```

### 3. **Component Architecture**

#### ✅ DO:
```typescript
// Server Components by default
export default async function Page() {
  const data = await fetchData()
  return <div>{data}</div>
}

// Client Components only when needed
'use client'
export function InteractiveButton() {
  const [count, setCount] = useState(0)
}
```

#### ❌ DON'T:
```typescript
// Don't make everything client-side
'use client' // Unnecessary!
export default function StaticPage() {
  return <div>Static content</div>
}
```

### 4. **Internationalization**

#### ✅ DO:
```typescript
// Use type-safe translations
const t = await getTranslations('HomePage')
return <h1>{t('welcome')}</h1>

// Consistent locale handling
const { locale } = await params
redirect(`/${locale}/dashboard`)
```

#### ❌ DON'T:
```typescript
// Avoid hardcoded text
return <h1>Welcome</h1> // Not translatable!

// Don't forget locale in redirects
redirect('/dashboard') // Missing locale!
```

### 5. **SSR/CSR Consistency & Hydration**

#### ✅ DO:
```typescript
// Use Next.js hooks for route parameters
'use client'
import { useParams } from 'next/navigation'

export function Component() {
  const params = useParams()
  const locale = params.locale as string || 'en'
  return <Link href={`/${locale}/page`}>Link</Link>
}

// Conditional rendering with suppressHydrationWarning for browser-specific content
export function BrowserSpecific() {
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null
  
  return <div suppressHydrationWarning>{window.location.href}</div>
}

// Use server components for consistent data
export default async function Page({ params }: { params: { locale: string } }) {
  const locale = params.locale
  return <ClientComponent locale={locale} />
}
```

#### ❌ DON'T:
```typescript
// Never use window object directly in components that affect SSR
'use client'
export function BadComponent() {
  // HYDRATION ERROR: Different on server vs client!
  const pathname = typeof window !== 'undefined' ? window.location.pathname : ''
  const locale = pathname.split('/')[1] || 'en'
  return <Link href={`/${locale}/page`}>Link</Link>
}

// Don't access DOM APIs during initial render
export function BadBrowserCheck() {
  // HYDRATION ERROR: undefined on server, string on client!
  const userAgent = typeof window !== 'undefined' ? navigator.userAgent : undefined
  return <div>Browser: {userAgent}</div>
}

// Don't use different logic for server vs client
export function InconsistentRendering() {
  const isClient = typeof window !== 'undefined'
  return (
    <div>
      {isClient ? <ClientOnlyComponent /> : <ServerOnlyComponent />}
    </div>
  )
}
```

#### 🚨 **Hydration Debugging Tips:**
```typescript
// 1. Use React DevTools Profiler to identify hydration mismatches
// 2. Check browser console for hydration warnings
// 3. Use suppressHydrationWarning sparingly and only when necessary
// 4. Test with JavaScript disabled to verify SSR content

// Debug hydration issues
if (process.env.NODE_ENV === 'development') {
  console.log('Server render:', typeof window === 'undefined')
}
```

## 🔒 Security Checklist

### Environment Variables
- [x] All secrets in `.env.local`
- [x] `.env.local` in `.gitignore`
- [x] Different values for production
- [x] Never log sensitive data

### Authentication
- [x] Use HTTPS in production
- [x] Secure session cookies
- [x] CSRF protection enabled
- [x] Rate limiting (implement in production)

### Database
- [x] Connection string secured
- [x] SQL injection prevention (Prisma)
- [x] Regular backups (production)
- [x] Access control configured

## 🚀 Performance Guidelines

### 1. **Optimize Bundle Size**
```bash
# Analyze bundle
pnpm build
pnpm analyze # Add next-bundle-analyzer
```

### 2. **Image Optimization**
```tsx
import Image from 'next/image'

// Use Next.js Image component
<Image 
  src="/logo.png" 
  alt="Logo"
  width={200}
  height={50}
  priority // For above-fold images
/>
```

### 3. **Code Splitting**
```typescript
// Dynamic imports for heavy components
const HeavyComponent = dynamic(
  () => import('@/components/HeavyComponent'),
  { 
    loading: () => <Skeleton />,
    ssr: false // If client-only
  }
)
```

### 4. **Caching Strategy**
```typescript
// Cache API responses
export const revalidate = 3600 // 1 hour

// Or use fetch with cache
const data = await fetch(url, {
  next: { revalidate: 3600 }
})
```

## 🛠️ Development Workflow

### 1. **Git Workflow**
```bash
# Feature branch
git checkout -b feature/add-user-profile

# Commit with conventional commits
git commit -m "feat: add user profile page"
git commit -m "fix: resolve auth redirect loop"
git commit -m "docs: update setup instructions"
```

### 2. **Pre-commit Checks**
```json
// package.json
{
  "scripts": {
    "pre-commit": "pnpm lint && pnpm typecheck && pnpm test"
  }
}
```

### 3. **Code Review Checklist**
- [ ] No hardcoded values
- [ ] Proper error handling
- [ ] TypeScript types defined
- [ ] Responsive design tested
- [ ] Accessibility checked

## 📊 Monitoring & Logging

### 1. **Error Tracking**
```typescript
// Implement error boundary
class ErrorBoundary extends React.Component {
  componentDidCatch(error: Error) {
    // Log to error tracking service
    console.error('Error caught:', error)
  }
}
```

### 2. **Performance Monitoring**
```typescript
// Track Core Web Vitals
export function reportWebVitals(metric: any) {
  // Send to analytics
  console.log(metric)
}
```

### 3. **User Analytics**
```typescript
// Track user events (privacy-conscious)
const trackEvent = (event: string, properties?: any) => {
  // Send to analytics service
  if (typeof window !== 'undefined') {
    // Analytics code here
  }
}
```

## 🚦 Deployment Checklist

### Pre-deployment
- [ ] Environment variables set
- [ ] Database migrations ready
- [ ] Build succeeds locally
- [ ] Tests passing
- [ ] Security headers configured

### Production Configuration
```typescript
// next.config.js
module.exports = {
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  
  // Security headers
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        {
          key: 'X-Frame-Options',
          value: 'DENY'
        },
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff'
        },
        {
          key: 'Referrer-Policy',
          value: 'origin-when-cross-origin'
        }
      ]
    }]
  }
}
```

### Post-deployment
- [ ] Verify all features work
- [ ] Check error logs
- [ ] Monitor performance
- [ ] Test on multiple devices
- [ ] Verify SSL certificate

## 🎯 Code Quality Standards

### TypeScript
```typescript
// Use strict types
interface User {
  id: string
  email: string
  name: string | null // Explicit null
}

// Avoid any
function processData(data: unknown) { // Not any!
  // Type guard
  if (isValidData(data)) {
    // Process safely
  }
}
```

### Error Handling
```typescript
// Comprehensive error handling
try {
  const result = await riskyOperation()
  return { success: true, data: result }
} catch (error) {
  console.error('Operation failed:', error)
  return { 
    success: false, 
    error: error instanceof Error ? error.message : 'Unknown error'
  }
}
```

### Testing Strategy
```typescript
// Test critical paths
describe('Authentication', () => {
  it('should redirect unauthenticated users', async () => {
    // Test implementation
  })
  
  it('should allow authenticated access', async () => {
    // Test implementation
  })
})
```

## 📚 Resources

### Official Documentation
- [Next.js 15 Docs](https://nextjs.org/docs)
- [NextAuth.js v5 Docs](https://authjs.dev)
- [Prisma Docs](https://www.prisma.io/docs)
- [next-intl Docs](https://next-intl.dev)

### Learning Resources
- [Next.js Learn Course](https://nextjs.org/learn)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)
- [React Server Components](https://react.dev/rsc)

### Community
- [Next.js Discord](https://nextjs.org/discord)
- [Prisma Slack](https://slack.prisma.io)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/next.js)

---

Remember: **Good code is maintainable code**. Always prioritize clarity, security, and performance in that order!