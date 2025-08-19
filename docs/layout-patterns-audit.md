# Layout Patterns Audit - Phase 3

## 🔍 Identified Common Patterns

### 1. Authentication Guards

**Pattern**: Redirect logic based on authentication state

```typescript
// Protected Route Pattern (redirect if not authenticated)
const session = await auth()
if (!session?.user) {
  redirect(`/${locale}`)
}

// Public Route Pattern (redirect if authenticated)
const session = await auth()
if (session?.user) {
  redirect(`/${locale}/dashboard`)
}
```

**Found in**:
- `/dashboard/page.tsx` - Protected route
- `/account/page.tsx` - Protected route
- `/register/page.tsx` - Public route

### 2. Gradient Backgrounds

**Pattern**: Consistent gradient backgrounds across pages

```typescript
// Common gradient pattern
<div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50 via-white to-purple-50">
```

**Found in**:
- `/register/page.tsx`
- `/account/page.tsx`
- Similar patterns in other auth pages

### 3. Center Content Layouts

**Pattern**: Centered content with consistent spacing

```typescript
// Center layout for forms
<div className="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4 py-8">
  <div className="w-full max-w-md">
    {/* Form content */}
  </div>
</div>

// Center layout for loading states
<div className="min-h-screen flex items-center justify-center bg-gray-50">
  <div className="text-center">
    {/* Loading content */}
  </div>
</div>
```

**Found in**:
- `/register/page.tsx` - Form centering
- `/auth/signin/page.tsx` - Loading state centering
- Various other auth pages

### 4. Container Constraints

**Pattern**: Consistent max-width containers

```typescript
// Account page container
<div className="max-w-4xl mx-auto px-4">

// Form container
<div className="w-full max-w-md">

// Main layout container
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
```

**Variations**:
- `max-w-md` - Forms (register, login)
- `max-w-4xl` - Account management
- `max-w-7xl` - Main navigation

### 5. Min Height Calculations

**Pattern**: Accounting for navigation height

```typescript
// Subtracting nav height (4rem = 64px)
min-h-[calc(100vh-4rem)]
```

**Purpose**: Ensures content fills viewport minus navigation

### 6. Loading States

**Pattern**: Consistent loading UI

```typescript
<div className="text-center">
  <LoadingSpinner size="xl" color="primary" />
  <p className="mt-2 text-gray-600">Redirecting...</p>
</div>
```

## 📊 Layout Type Analysis

### Type 1: Authentication Pages
- **Characteristics**: Gradient background, centered form, public access
- **Pages**: register, signin, 2fa

### Type 2: Protected Pages
- **Characteristics**: Auth guard, gradient background, content container
- **Pages**: dashboard, account

### Type 3: Utility Pages
- **Characteristics**: Simple layouts, specific purposes
- **Pages**: error, verify-email, link-account

### Type 4: Loading/Redirect Pages
- **Characteristics**: Minimal UI, centered spinner
- **Pages**: signin redirect page

## 🎯 Refactoring Opportunities

1. **AuthGuard Component**
   - Extract authentication check logic
   - Support both protected and public routes
   - Handle redirects consistently

2. **PageLayout Components**
   - `GradientPageLayout` - For pages with gradient backgrounds
   - `CenteredFormLayout` - For auth forms
   - `DashboardLayout` - For protected content pages
   - `LoadingLayout` - For loading states

3. **Layout Utilities**
   - Container width constants
   - Min height helper functions
   - Responsive padding utilities

## 📝 Next Steps

1. Create reusable layout components
2. Extract common patterns into utilities
3. Migrate existing pages to use new components
4. Add proper TypeScript types
5. Create tests for layout components
6. Document usage patterns