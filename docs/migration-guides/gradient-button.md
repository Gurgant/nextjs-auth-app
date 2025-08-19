# GradientButton Component Migration Guide

## Overview
This guide helps you migrate from inline gradient button styles to the reusable `GradientButton` component.

## Import Statement
```tsx
import { GradientButton } from '@/components/ui/gradient-button';
```

## Migration Examples

### Example 1: Sign In Button (Blue Gradient)

**BEFORE:**
```tsx
<button
  type="submit"
  disabled={loading}
  className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
>
  {loading ? (
    <>
      <LoadingSpinner size="md" color="white" className="-ml-1 mr-3" />
      {t('signingIn')}
    </>
  ) : (
    t('signInButton')
  )}
</button>
```

**AFTER:**
```tsx
<GradientButton
  type="submit"
  variant="blue"
  fullWidth
  loading={loading}
  loadingText={t('signingIn')}
>
  {t('signInButton')}
</GradientButton>
```

### Example 2: Register Button (Green Gradient)

**BEFORE:**
```tsx
<button
  type="submit"
  disabled={isLoading || !agreed}
  className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
>
  {isLoading ? (
    <>
      <LoadingSpinner size="md" color="white" className="-ml-1 mr-3" />
      {t('creating')}
    </>
  ) : (
    t('createAccount')
  )}
</button>
```

**AFTER:**
```tsx
<GradientButton
  type="submit"
  variant="green"
  fullWidth
  disabled={!agreed}
  loading={isLoading}
  loadingText={t('creating')}
>
  {t('createAccount')}
</GradientButton>
```

### Example 3: Delete Account Button (Red Gradient)

**BEFORE:**
```tsx
<button
  type="submit"
  disabled={isDeletingAccount || emailConfirmation !== user.email}
  className="flex-1 flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
>
  {isDeletingAccount ? (
    <>
      <LoadingSpinner size="md" color="white" className="-ml-1 mr-3" />
      Deleting...
    </>
  ) : (
    t('deleteAccount')
  )}
</button>
```

**AFTER:**
```tsx
<GradientButton
  type="submit"
  variant="red"
  className="flex-1"
  disabled={emailConfirmation !== user.email}
  loading={isDeletingAccount}
  loadingText="Deleting..."
>
  {t('deleteAccount')}
</GradientButton>
```

### Example 4: Two-Factor Setup (Blue-Purple Gradient)

**BEFORE:**
```tsx
<button
  type="button"
  disabled={isLoading}
  className="flex-1 flex justify-center items-center py-3 px-4 border border-transparent rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
>
  {isLoading ? (
    <>
      <LoadingSpinner size="md" color="white" className="-ml-1 mr-3" />
      Setting up...
    </>
  ) : (
    'Continue'
  )}
</button>
```

**AFTER:**
```tsx
<GradientButton
  type="button"
  variant="blue-purple"
  className="flex-1"
  loading={isLoading}
  loadingText="Setting up..."
>
  Continue
</GradientButton>
```

### Example 5: Password Management (Yellow-Orange)

**BEFORE:**
```tsx
<button
  type="submit"
  disabled={isAddingPassword}
  className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
>
  {isAddingPassword ? (
    <>
      <LoadingSpinner size="md" color="white" className="-ml-1 mr-3" />
      Adding...
    </>
  ) : (
    t('setPassword')
  )}
</button>
```

**AFTER:**
```tsx
<GradientButton
  type="submit"
  variant="yellow-orange"
  fullWidth
  loading={isAddingPassword}
  loadingText="Adding..."
>
  {t('setPassword')}
</GradientButton>
```

## Props Reference

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'blue-purple' \| 'green-emerald' \| 'yellow-orange' \| 'red' \| 'blue' \| 'green'` | `'blue-purple'` | Color gradient variant |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Button size |
| `fullWidth` | `boolean` | `false` | Makes button full width |
| `loading` | `boolean` | `false` | Shows loading state |
| `loadingText` | `string` | - | Text to show when loading |
| `disabled` | `boolean` | `false` | Disables the button |
| `className` | `string` | - | Additional CSS classes |
| `...props` | `ButtonHTMLAttributes` | - | All standard button props |

## Variant Mapping

| Old Gradient | New Variant |
|--------------|-------------|
| `from-blue-600 to-blue-700` | `blue` |
| `from-green-600 to-green-700` | `green` |
| `from-blue-600 to-purple-700` | `blue-purple` |
| `from-green-600 to-emerald-700` | `green-emerald` |
| `from-yellow-600 to-orange-600` | `yellow-orange` |
| `from-red-600 to-red-700` | `red` |
| `from-orange-600 to-red-600` | `red` (closest match) |

## Search Patterns for Migration

To find all gradient buttons in your codebase:

```bash
# Find gradient button patterns
grep -r "bg-gradient-to-r.*from-.*to-.*hover:from-.*hover:to-" src/

# Find buttons with loading states
grep -r -B2 -A2 "isLoading.*?.*<>.*LoadingSpinner" src/

# Using ripgrep for better results
rg "bg-gradient-to-r.*from-\w+-\d+.*to-\w+-\d+" --type tsx -A5 -B5
```

## Common Migration Patterns

### Pattern 1: Full Width Loading Button
```tsx
// Look for: w-full.*bg-gradient-to-r.*{loading.*LoadingSpinner
// Replace with: <GradientButton fullWidth loading={...} loadingText={...}>
```

### Pattern 2: Flex-1 Button (in button groups)
```tsx
// Look for: flex-1.*bg-gradient-to-r
// Replace with: <GradientButton className="flex-1">
```

### Pattern 3: Custom Disabled Logic
```tsx
// Look for: disabled={condition1 || condition2}
// Keep the same: <GradientButton disabled={condition1 || condition2}>
```

## Important Notes

1. **Loading State**: The component automatically handles the loading spinner and disabled state
2. **Loading Text**: When `loadingText` is provided, it replaces the children during loading
3. **Full Width**: Use `fullWidth` prop instead of `w-full` class
4. **Flex Items**: For buttons in flex containers, use `className="flex-1"` or similar
5. **Transform Effects**: The scale effects are built-in, don't add them again

## Testing After Migration

1. **Visual Check**: Ensure gradients match the design
2. **Loading State**: Test that loading spinner appears correctly
3. **Disabled State**: Verify proper disabled styling and behavior
4. **Click Handlers**: Ensure onClick and form submissions work
5. **Responsive**: Check button sizing on different screens

## Troubleshooting

### Button Not Full Width
- Use `fullWidth` prop, not `className="w-full"`

### Custom Gradient Needed
- If you need a gradient not in variants, keep the original implementation
- Consider adding new variant to the component

### Form Submission Issues
- Ensure `type="submit"` is passed through
- Check that loading state doesn't prevent submission

### Styling Conflicts
- The component uses `cn()` utility, so custom classes will merge properly
- If conflicts occur, check specificity and use `!important` sparingly