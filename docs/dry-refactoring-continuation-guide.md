# DRY Refactoring - Continuation Guide

## 🚀 How to Continue the Implementation

### Next Component: AlertMessage

#### Step 1: Create the Component

```bash
# Create the component file
touch src/components/ui/alert-message.tsx
```

#### Step 2: Component Structure

```tsx
// src/components/ui/alert-message.tsx
import { cn } from "@/lib/utils";

interface AlertMessageProps {
  type: "success" | "error" | "warning" | "info";
  message: string;
  errors?: Record<string, string>;
  onDismiss?: () => void;
  className?: string;
}

const typeStyles = {
  success: {
    container: "bg-green-50 border-green-200",
    icon: "text-green-400",
    text: "text-green-700",
  },
  error: {
    container: "bg-red-50 border-red-200",
    icon: "text-red-400",
    text: "text-red-700",
  },
  // ... add warning and info
};

export function AlertMessage({
  type,
  message,
  errors,
  onDismiss,
  className,
}: AlertMessageProps) {
  // Implementation here
}
```

#### Step 3: Find and Replace Pattern

Look for these patterns:

```tsx
// Pattern 1: Success/Error messages
<div className={`rounded-xl p-4 ${
  result.success
    ? 'bg-green-50 border border-green-200'
    : 'bg-red-50 border border-red-200'
}`}>

// Pattern 2: With icons
{result.success ? (
  <svg className="h-5 w-5 text-green-400 mr-2">...</svg>
) : (
  <svg className="h-5 w-5 text-red-400 mr-2">...</svg>
)}

// Pattern 3: With error details
{result.errors && (
  <div className="mt-2">
    {Object.entries(result.errors).map(([field, error]) => (
      <p key={field} className="text-sm text-red-600">{error}</p>
    ))}
  </div>
)}
```

#### Step 4: Test the Component

```bash
# Create test file
touch src/components/ui/__tests__/alert-message.test.tsx

# Run tests
pnpm test alert-message
```

### Files to Update for AlertMessage

1. `src/components/auth/registration-form.tsx` (lines ~189-212)
2. `src/components/auth/two-factor-verification.tsx` (lines ~243-290)
3. `src/components/security/two-factor-setup.tsx` (lines ~321-344)
4. `src/components/account/account-management.tsx` (multiple locations)

### Quick Commands for Development

```bash
# Run type checking
pnpm tsc --noEmit --skipLibCheck

# Run tests
pnpm test

# Build to verify
pnpm build

# Search for patterns
rg "bg-green-50.*border.*border-green-200" --type tsx
rg "bg-red-50.*border.*border-red-200" --type tsx
```

### Implementation Checklist

- [ ] Create component file
- [ ] Add TypeScript interfaces
- [ ] Implement all variants (success, error, warning, info)
- [ ] Add icon support
- [ ] Add dismiss functionality
- [ ] Create tests
- [ ] Create migration guide
- [ ] Replace first instance and test
- [ ] Replace all instances systematically
- [ ] Update documentation

### Time Estimates

- **AlertMessage Component**: 1-2 hours
- **InputWithIcon Component**: 2-3 hours
- **Form Utilities**: 1-2 hours
- **Layout Components**: 2-3 hours
- **Total Remaining**: 6-10 hours

### Pro Tips

1. **Use the existing patterns**: LoadingSpinner and GradientButton set good examples
2. **Test incrementally**: Replace one instance, test, then continue
3. **Keep the API simple**: Don't over-engineer
4. **Document as you go**: Update migration guides immediately
5. **Commit frequently**: Small, atomic commits

### Success Metrics

- All tests passing
- No TypeScript errors
- Build succeeds
- Visual appearance unchanged
- Code reduction achieved

---

**Remember**: The goal is consistency and maintainability, not perfection. Each component you create makes the codebase better!
