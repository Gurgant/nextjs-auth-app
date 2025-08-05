# Layout Components Usage Examples

This document provides practical examples of using layout components in various scenarios.

## Table of Contents
1. [Authentication Pages](#authentication-pages)
2. [Protected Pages](#protected-pages)
3. [Loading States](#loading-states)
4. [Error Handling](#error-handling)
5. [Complex Layouts](#complex-layouts)
6. [Migration Examples](#migration-examples)

## Authentication Pages

### Registration Page

```tsx
// app/[locale]/register/page.tsx
import { AuthGuard, FormPageLayout } from '@/components/layouts'
import { RegistrationForm } from '@/components/forms/registration-form'

interface Props {
  params: Promise<{ locale: string }>
}

export default async function RegisterPage({ params }: Props) {
  const { locale } = await params
  
  return (
    <AuthGuard locale={locale} requireAuth={false}>
      <FormPageLayout>
        <RegistrationForm locale={locale} />
      </FormPageLayout>
    </AuthGuard>
  )
}
```

### Sign In Page with Custom Gradient

```tsx
// app/[locale]/signin/page.tsx
import { AuthGuard, FormPageLayout } from '@/components/layouts'
import { SignInForm } from '@/components/forms/signin-form'

export default async function SignInPage({ params }: Props) {
  const { locale } = await params
  
  return (
    <AuthGuard locale={locale} requireAuth={false} redirectTo={`/${locale}/dashboard`}>
      <FormPageLayout gradient="purple-pink">
        <SignInForm locale={locale} />
      </FormPageLayout>
    </AuthGuard>
  )
}
```

### Password Reset Page

```tsx
// app/[locale]/reset-password/page.tsx
import { FormPageLayout } from '@/components/layouts'
import { PasswordResetForm } from '@/components/forms/password-reset-form'

export default async function ResetPasswordPage({ params }: Props) {
  const { locale } = await params
  
  return (
    <FormPageLayout gradient="green-blue" maxWidth="sm">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold">Reset Your Password</h1>
        <p className="text-gray-600 mt-2">Enter your email to receive a reset link</p>
      </div>
      <PasswordResetForm locale={locale} />
    </FormPageLayout>
  )
}
```

## Protected Pages

### Dashboard with Full Width

```tsx
// app/[locale]/dashboard/page.tsx
import { auth } from '@/lib/auth'
import { AuthGuard, DashboardLayout } from '@/components/layouts'
import { DashboardContent } from '@/components/dashboard-content'

export default async function DashboardPage({ params }: Props) {
  const session = await auth()
  const { locale } = await params
  
  return (
    <AuthGuard locale={locale} requireAuth>
      <DashboardLayout maxWidth="7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Welcome back, {session.user?.name}!</h1>
        </div>
        <DashboardContent user={session.user!} />
      </DashboardLayout>
    </AuthGuard>
  )
}
```

### Account Settings with Gradient

```tsx
// app/[locale]/account/page.tsx
import { auth } from '@/lib/auth'
import { AuthGuard, DashboardLayout } from '@/components/layouts'
import { AccountManagement } from '@/components/account/account-management'

export default async function AccountPage({ params }: Props) {
  const session = await auth()
  const { locale } = await params
  
  return (
    <AuthGuard locale={locale} requireAuth>
      <DashboardLayout gradient maxWidth="4xl" className="py-12">
        <AccountManagement user={session.user!} locale={locale} />
      </DashboardLayout>
    </AuthGuard>
  )
}
```

### Profile Page with Custom Layout

```tsx
// app/[locale]/profile/page.tsx
import { AuthGuard, GradientPageLayout, CenteredContentLayout } from '@/components/layouts'
import { UserProfile } from '@/components/profile/user-profile'

export default async function ProfilePage({ params }: Props) {
  const { locale } = await params
  
  return (
    <AuthGuard locale={locale} requireAuth>
      <GradientPageLayout gradient="blue-purple">
        <CenteredContentLayout maxWidth="2xl" className="py-16">
          <UserProfile locale={locale} />
        </CenteredContentLayout>
      </GradientPageLayout>
    </AuthGuard>
  )
}
```

## Loading States

### Page Loading

```tsx
// app/[locale]/dashboard/loading.tsx
import { LoadingLayout } from '@/components/layouts'

export default function Loading() {
  return (
    <LoadingLayout 
      message="Loading your dashboard..." 
      spinnerSize="xl"
    />
  )
}
```

### Full Screen App Loading

```tsx
// app/[locale]/loading.tsx
import { LoadingLayout } from '@/components/layouts'

export default function RootLoading() {
  return (
    <LoadingLayout 
      fullScreen
      message="Initializing application..." 
      spinnerSize="xl"
      className="bg-gradient-to-br from-blue-50 to-purple-50"
    />
  )
}
```

### Custom Loading Component

```tsx
// components/custom-loading.tsx
import { LoadingLayout } from '@/components/layouts'

export function DataLoadingState({ message }: { message?: string }) {
  return (
    <LoadingLayout
      message={message || "Fetching data..."}
      spinnerSize="md"
      fullScreen={false}
      className="min-h-[400px] bg-white rounded-lg shadow-sm"
    />
  )
}
```

## Error Handling

### Error Page

```tsx
// app/[locale]/error/page.tsx
import { CenteredContentLayout } from '@/components/layouts'
import { AlertMessage } from '@/components/ui/alert-message'
import Link from 'next/link'

interface Props {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ message?: string }>
}

export default async function ErrorPage({ params, searchParams }: Props) {
  const { locale } = await params
  const { message } = await searchParams
  
  return (
    <CenteredContentLayout maxWidth="md" className="bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md">
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900">Something went wrong</h1>
        </div>
        
        <AlertMessage 
          type="error" 
          message={message || "An unexpected error occurred"} 
          className="mb-6"
        />
        
        <div className="flex gap-4 justify-center">
          <Link 
            href={`/${locale}`}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Go Home
          </Link>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Try Again
          </button>
        </div>
      </div>
    </CenteredContentLayout>
  )
}
```

### Not Found Page

```tsx
// app/[locale]/not-found.tsx
import { GradientPageLayout, CenteredContentLayout } from '@/components/layouts'
import Link from 'next/link'

export default function NotFound() {
  return (
    <GradientPageLayout>
      <CenteredContentLayout>
        <div className="text-center">
          <h1 className="text-9xl font-bold text-gray-200">404</h1>
          <p className="text-2xl font-semibold text-gray-700 mt-4">Page not found</p>
          <p className="text-gray-500 mt-2">The page you're looking for doesn't exist.</p>
          <Link 
            href="/"
            className="mt-6 inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go back home
          </Link>
        </div>
      </CenteredContentLayout>
    </GradientPageLayout>
  )
}
```

## Complex Layouts

### Multi-Step Form with Progress

```tsx
// app/[locale]/onboarding/page.tsx
import { AuthGuard, FormPageLayout } from '@/components/layouts'
import { OnboardingForm } from '@/components/forms/onboarding-form'
import { ProgressBar } from '@/components/ui/progress-bar'

export default async function OnboardingPage({ params }: Props) {
  const { locale } = await params
  
  return (
    <AuthGuard locale={locale} requireAuth>
      <FormPageLayout maxWidth="lg">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <ProgressBar steps={4} currentStep={1} className="mb-8" />
          <OnboardingForm locale={locale} />
        </div>
      </FormPageLayout>
    </AuthGuard>
  )
}
```

### Settings Page with Sidebar

```tsx
// app/[locale]/settings/page.tsx
import { AuthGuard, DashboardLayout } from '@/components/layouts'
import { SettingsSidebar } from '@/components/settings/sidebar'
import { SettingsContent } from '@/components/settings/content'

export default async function SettingsPage({ params }: Props) {
  const { locale } = await params
  
  return (
    <AuthGuard locale={locale} requireAuth>
      <DashboardLayout maxWidth="7xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <aside className="md:col-span-1">
            <SettingsSidebar />
          </aside>
          <main className="md:col-span-3">
            <SettingsContent locale={locale} />
          </main>
        </div>
      </DashboardLayout>
    </AuthGuard>
  )
}
```

### Modal-like Page

```tsx
// app/[locale]/confirm-action/page.tsx
import { AuthGuard, GradientPageLayout, CenteredContentLayout } from '@/components/layouts'

export default async function ConfirmActionPage({ params }: Props) {
  const { locale } = await params
  
  return (
    <AuthGuard locale={locale} requireAuth>
      <GradientPageLayout className="bg-black/50">
        <CenteredContentLayout maxWidth="sm">
          <div className="bg-white rounded-xl shadow-2xl p-8 transform -translate-y-20">
            <h2 className="text-xl font-bold mb-4">Confirm Action</h2>
            <p className="text-gray-600 mb-6">
              Are you sure you want to proceed with this action?
            </p>
            <div className="flex gap-4">
              <button className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md">
                Confirm
              </button>
              <button className="flex-1 px-4 py-2 border border-gray-300 rounded-md">
                Cancel
              </button>
            </div>
          </div>
        </CenteredContentLayout>
      </GradientPageLayout>
    </AuthGuard>
  )
}
```

## Migration Examples

### Before: Inline Layout Code

```tsx
// ❌ Old approach - lots of repeated layout code
export default function OldRegisterPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="flex items-center justify-center px-4 py-8 min-h-[calc(100vh-4rem)]">
        <div className="w-full max-w-md">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8">
            <RegistrationForm />
          </div>
        </div>
      </div>
    </div>
  )
}
```

### After: Using Layout Components

```tsx
// ✅ New approach - clean and reusable
export default function NewRegisterPage({ params }: Props) {
  const { locale } = await params
  
  return (
    <AuthGuard locale={locale} requireAuth={false}>
      <FormPageLayout>
        <RegistrationForm locale={locale} />
      </FormPageLayout>
    </AuthGuard>
  )
}
```

### Before: Complex Dashboard Layout

```tsx
// ❌ Old approach - complex nested divs
export default async function OldDashboard() {
  const session = await auth()
  
  if (!session) {
    redirect('/login')
  }
  
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="bg-white rounded-lg shadow p-6">
            <DashboardContent user={session.user!} />
          </div>
        </div>
      </div>
    </div>
  )
}
```

### After: Clean Dashboard with Layouts

```tsx
// ✅ New approach - authentication and layout handled elegantly
export default async function NewDashboard({ params }: Props) {
  const session = await auth()
  const { locale } = await params
  
  return (
    <AuthGuard locale={locale} requireAuth>
      <DashboardLayout maxWidth="7xl">
        <div className="bg-white rounded-lg shadow p-6">
          <DashboardContent user={session.user!} />
        </div>
      </DashboardLayout>
    </AuthGuard>
  )
}
```

## Best Practices Summary

1. **Always use AuthGuard** for pages that need authentication control
2. **Choose the right layout** for your use case:
   - `FormPageLayout` for auth forms
   - `DashboardLayout` for app content
   - `LoadingLayout` for loading states
3. **Compose layouts** when needed for complex UIs
4. **Keep content focused** - let layouts handle the structure
5. **Use TypeScript** for type safety with all props
6. **Test your layouts** to ensure they work across different screen sizes