# LoadingSpinner Component Migration Guide

## Overview

This guide helps you migrate from inline SVG spinners to the reusable `LoadingSpinner` component.

## Import Statement

```tsx
import { LoadingSpinner } from "@/components/ui/loading-spinner";
```

## Migration Examples

### Example 1: Button Loading State (White Spinner)

**BEFORE:**

```tsx
<button className="...">
  {isLoading ? (
    <>
      <svg
        className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        ></circle>
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
      Loading...
    </>
  ) : (
    "Submit"
  )}
</button>
```

**AFTER:**

```tsx
<button className="...">
  {isLoading ? (
    <>
      <LoadingSpinner size="md" color="white" className="-ml-1 mr-3" />
      Loading...
    </>
  ) : (
    "Submit"
  )}
</button>
```

### Example 2: Standalone Loading State

**BEFORE:**

```tsx
<div className="flex justify-center items-center">
  <svg
    className="animate-spin h-8 w-8 text-blue-600"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    ></circle>
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    ></path>
  </svg>
</div>
```

**AFTER:**

```tsx
<div className="flex justify-center items-center">
  <LoadingSpinner size="xl" color="primary" />
</div>
```

### Example 3: Custom Colored Spinner

**BEFORE:**

```tsx
<svg
  className="animate-spin h-6 w-6 text-purple-600"
  fill="none"
  viewBox="0 0 24 24"
>
  {/* ... same SVG content ... */}
</svg>
```

**AFTER:**

```tsx
<LoadingSpinner size="lg" color="secondary" />
```

### Example 4: Small Inline Spinner

**BEFORE:**

```tsx
<span className="inline-flex items-center">
  <svg
    className="animate-spin h-4 w-4 text-gray-600 mr-2"
    fill="none"
    viewBox="0 0 24 24"
  >
    {/* ... same SVG content ... */}
  </svg>
  Processing...
</span>
```

**AFTER:**

```tsx
<span className="inline-flex items-center">
  <LoadingSpinner size="sm" color="gray" className="mr-2" />
  Processing...
</span>
```

## Props Reference

| Prop        | Type                                            | Default        | Description                         |
| ----------- | ----------------------------------------------- | -------------- | ----------------------------------- |
| `size`      | `'sm' \| 'md' \| 'lg' \| 'xl'`                  | `'md'`         | Size of the spinner                 |
| `color`     | `'white' \| 'primary' \| 'secondary' \| 'gray'` | `'primary'`    | Color variant                       |
| `className` | `string`                                        | -              | Additional CSS classes              |
| `label`     | `string`                                        | `'Loading...'` | Accessible label for screen readers |

## Size Mapping

- `sm`: 16px (h-4 w-4)
- `md`: 20px (h-5 w-5) - Default
- `lg`: 24px (h-6 w-6)
- `xl`: 32px (h-8 w-8)

## Color Mapping

- `white`: text-white
- `primary`: text-blue-600 - Default
- `secondary`: text-purple-600
- `gray`: text-gray-600

## Accessibility Note

The component automatically includes:

- `role="status"` for screen readers
- `aria-label` with customizable text
- Proper SVG accessibility attributes

## Search Patterns for Migration

To find all instances of inline spinners in your codebase, use:

```bash
# Find basic spinner pattern
grep -r "animate-spin.*svg" src/

# Find spinner with circle and path
grep -r -A5 "animate-spin.*svg" src/ | grep -B5 "M4 12a8 8"

# Using ripgrep for better results
rg "animate-spin.*svg" --type tsx -A10
```

## Common Migration Patterns

### Pattern 1: Button with Loading State

Look for: `{isLoading && <svg className="animate-spin`
Replace with: `{isLoading && <LoadingSpinner`

### Pattern 2: Standalone Spinner

Look for: `<svg className="animate-spin h-\d+ w-\d+`
Replace with: `<LoadingSpinner size="..." color="..."`

### Pattern 3: Inline Text Spinner

Look for: `animate-spin.*mr-\d+.*text`
Replace with: `<LoadingSpinner ... className="mr-..."`

## Testing After Migration

1. **Visual Check**: Ensure spinner appears and animates correctly
2. **Size Verification**: Confirm the size matches the original
3. **Color Check**: Verify color matches the design
4. **Spacing**: Check margins/padding are preserved
5. **Accessibility**: Test with screen reader to ensure label is announced

## Rollback Information

If you need to rollback a specific instance:

1. Comment out the LoadingSpinner import
2. Restore the original SVG code from git history
3. File an issue with the specific use case that didn't work

## Questions or Issues?

If you encounter any edge cases not covered here:

1. Check if a new size/color variant is needed
2. Consider if a custom className can solve it
3. Open a PR to add the new variant if widely used
