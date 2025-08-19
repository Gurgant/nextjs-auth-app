# Layout Components Documentation

## Overview

The layout components provide a consistent and reusable way to structure pages throughout the application. They handle common patterns like authentication guards, gradient backgrounds, centered content, and responsive containers.

## Component Architecture

```
src/components/layouts/
├── auth-guard.tsx          # Authentication-based routing
├── gradient-page-layout.tsx # Gradient background layouts
├── centered-content-layout.tsx # Centered content with max-width
├── form-page-layout.tsx    # Combination layout for forms
├── dashboard-layout.tsx    # Layout for dashboard/protected pages
├── loading-layout.tsx      # Consistent loading states
└── index.ts               # Barrel exports
```

## Components

### AuthGuard

A server component that handles authentication-based routing and access control.

#### Props
- `children`: React.ReactNode - Content to render
- `locale`: string - Current locale for redirects
- `requireAuth?`: boolean (default: true) - Whether authentication is required
- `redirectTo?`: string - Custom redirect path

#### Usage

```tsx
// Protected route (redirects to home if not authenticated)
<AuthGuard locale={locale} requireAuth>
  <ProtectedContent />
</AuthGuard>

// Public route (redirects to dashboard if authenticated)
<AuthGuard locale={locale} requireAuth={false}>
  <PublicContent />
</AuthGuard>

// Custom redirect
<AuthGuard locale={locale} requireAuth redirectTo="/custom-login">
  <ProtectedContent />
</AuthGuard>
```

### GradientPageLayout

Provides gradient background styling with multiple color schemes.

#### Props
- `children`: React.ReactNode - Content to render
- `className?`: string - Additional CSS classes
- `gradient?`: 'default' | 'blue-purple' | 'green-blue' | 'purple-pink' (default: 'default')

#### Usage

```tsx
// Default gradient
<GradientPageLayout>
  <YourContent />
</GradientPageLayout>

// Custom gradient
<GradientPageLayout gradient="green-blue" className="py-12">
  <YourContent />
</GradientPageLayout>
```

### CenteredContentLayout

Centers content with flexible max-width constraints and optional full-height centering.

#### Props
- `children`: React.ReactNode - Content to render
- `maxWidth?`: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '7xl' (default: 'md')
- `className?`: string - Additional CSS classes
- `fullHeight?`: boolean (default: true) - Whether to use full viewport height

#### Usage

```tsx
// Form layout
<CenteredContentLayout maxWidth="md">
  <LoginForm />
</CenteredContentLayout>

// Full height centering
<CenteredContentLayout fullHeight>
  <LoadingSpinner />
</CenteredContentLayout>

// Without full height
<CenteredContentLayout fullHeight={false} maxWidth="lg">
  <Content />
</CenteredContentLayout>
```

### FormPageLayout

Specialized layout combining gradient background with centered content, perfect for authentication forms.

#### Props
- `children`: React.ReactNode - Content to render
- `gradient?`: 'default' | 'blue-purple' | 'green-blue' | 'purple-pink' (default: 'default')
- `maxWidth?`: 'sm' | 'md' | 'lg' (default: 'md')

#### Usage

```tsx
// Basic form layout
<FormPageLayout>
  <RegistrationForm />
</FormPageLayout>

// With custom gradient and width
<FormPageLayout gradient="green-blue" maxWidth="lg">
  <ComplexForm />
</FormPageLayout>
```

### DashboardLayout

Layout for dashboard and protected pages with optional gradient background.

#### Props
- `children`: React.ReactNode - Content to render
- `maxWidth?`: 'lg' | 'xl' | '2xl' | '4xl' | '7xl' (default: '4xl')
- `className?`: string - Additional CSS classes
- `gradient?`: boolean (default: false) - Whether to use gradient background

#### Usage

```tsx
// Basic dashboard layout
<DashboardLayout>
  <DashboardContent />
</DashboardLayout>

// With gradient and custom width
<DashboardLayout gradient maxWidth="7xl">
  <AccountManagement />
</DashboardLayout>
```

### LoadingLayout

Provides consistent loading states across the application.

#### Props
- `message?`: string (default: 'Loading...') - Loading message to display
- `fullScreen?`: boolean (default: false) - Whether to use full screen height
- `spinnerSize?`: 'sm' | 'md' | 'lg' | 'xl' (default: 'lg') - Size of the loading spinner
- `className?`: string - Additional CSS classes

#### Usage

```tsx
// Basic loading
<LoadingLayout />

// With custom message
<LoadingLayout message="Processing your request..." spinnerSize="xl" />

// Full screen loading
<LoadingLayout fullScreen message="Loading application..." />
```

## Migration Guide

### Before (Direct Layout Code)

```tsx
// pages/register.tsx
export default function RegisterPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="flex items-center justify-center px-4 py-8 min-h-[calc(100vh-4rem)]">
        <div className="w-full max-w-md">
          <RegistrationForm />
        </div>
      </div>
    </div>
  )
}
```

### After (Using Layout Components)

```tsx
// pages/register.tsx
import { FormPageLayout } from '@/components/layouts'

export default function RegisterPage() {
  return (
    <FormPageLayout>
      <RegistrationForm />
    </FormPageLayout>
  )
}
```

## Best Practices

1. **Use AuthGuard for Route Protection**
   - Always wrap protected pages with AuthGuard
   - Use `requireAuth={false}` for public pages that should redirect authenticated users

2. **Choose the Right Layout**
   - Use `FormPageLayout` for authentication forms
   - Use `DashboardLayout` for protected content pages
   - Use `CenteredContentLayout` for simple centered content
   - Use `GradientPageLayout` when you need just the gradient background

3. **Composition Over Configuration**
   - Layout components can be nested for complex layouts
   - Keep layouts simple and focused on their specific purpose

4. **Consistent Spacing**
   - All layouts handle navbar spacing automatically (4rem)
   - Use the `className` prop for additional spacing needs

5. **Responsive Design**
   - All layouts are mobile-responsive by default
   - Max-width constraints ensure content readability on large screens

## Testing

All layout components have comprehensive test coverage. Run tests with:

```bash
pnpm test src/components/layouts/__tests__
```

## TypeScript Support

All components are fully typed with TypeScript. Import types as needed:

```tsx
import type { AuthGuardProps, GradientPageLayoutProps } from '@/components/layouts'
```

## Examples

### Complete Authentication Page

```tsx
import { AuthGuard, FormPageLayout } from '@/components/layouts'
import { RegistrationForm } from '@/components/forms'

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

### Protected Dashboard Page

```tsx
import { AuthGuard, DashboardLayout } from '@/components/layouts'
import { DashboardContent } from '@/components/dashboard'

export default async function DashboardPage({ params }: Props) {
  const { locale } = await params
  
  return (
    <AuthGuard locale={locale} requireAuth>
      <DashboardLayout gradient maxWidth="7xl">
        <DashboardContent />
      </DashboardLayout>
    </AuthGuard>
  )
}
```

### Loading State

```tsx
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