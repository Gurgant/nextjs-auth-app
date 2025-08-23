# AlertMessage Component Migration Guide

## Overview

This guide helps you migrate from inline alert/message patterns to the reusable `AlertMessage` component.

## Import Statement

```tsx
import { AlertMessage } from "@/components/ui/alert-message";
```

## Migration Examples

### Example 1: Simple Success/Error Message

**BEFORE:**

```tsx
{
  result?.message && (
    <div
      className={`rounded-xl p-4 ${
        result.success
          ? "bg-green-50 border border-green-200"
          : "bg-red-50 border border-red-200"
      }`}
    >
      <div className="flex items-center">
        {result.success ? (
          <svg
            className="h-5 w-5 text-green-400 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        ) : (
          <svg
            className="h-5 w-5 text-red-400 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
        <p
          className={`text-sm font-medium ${
            result.success ? "text-green-700" : "text-red-700"
          }`}
        >
          {result.message}
        </p>
      </div>
    </div>
  );
}
```

**AFTER:**

```tsx
{
  result?.message && (
    <AlertMessage
      type={result.success ? "success" : "error"}
      message={result.message}
    />
  );
}
```

### Example 2: Error Message with Field Errors

**BEFORE:**

```tsx
{
  result?.message && (
    <div className="rounded-xl p-4 bg-red-50 border border-red-200">
      <div className="flex items-center">
        <svg
          className="h-5 w-5 text-red-400 mr-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-sm font-medium text-red-700">{result.message}</p>
      </div>
      {result.errors && (
        <div className="mt-2">
          {Object.entries(result.errors).map(([field, error]) => (
            <p key={field} className="text-sm text-red-600">
              {error}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
```

**AFTER:**

```tsx
{
  result?.message && (
    <AlertMessage
      type="error"
      message={result.message}
      errors={result.errors}
    />
  );
}
```

### Example 3: Dismissible Alert

**BEFORE:**

```tsx
{
  verificationResult && (
    <div className="rounded-xl p-4 bg-green-50 border border-green-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <svg
            className="h-5 w-5 text-green-400 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm font-medium text-green-700">
            {verificationResult.message}
          </p>
        </div>
        <button
          onClick={() => setVerificationResult(null)}
          className="text-green-700 hover:text-green-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

**AFTER:**

```tsx
{
  verificationResult && (
    <AlertMessage
      type="success"
      message={verificationResult.message}
      onDismiss={() => setVerificationResult(null)}
    />
  );
}
```

### Example 4: Info/Warning Messages

**BEFORE:**

```tsx
<div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
  <div className="flex items-start">
    <svg
      className="h-5 w-5 text-blue-400 mr-2 mt-0.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
    <div>
      <h4 className="text-sm font-medium text-blue-800 mb-1">
        Enhanced Security
      </h4>
      <p className="text-sm text-blue-700">
        Two-factor authentication significantly increases your account security.
      </p>
    </div>
  </div>
</div>
```

**AFTER:**

```tsx
<AlertMessage
  type="info"
  message="Enhanced Security: Two-factor authentication significantly increases your account security."
/>
```

## Props Reference

| Prop        | Type                                          | Required | Description             |
| ----------- | --------------------------------------------- | -------- | ----------------------- |
| `type`      | `'success' \| 'error' \| 'warning' \| 'info'` | Yes      | Alert variant           |
| `message`   | `string`                                      | Yes      | Main message to display |
| `errors`    | `Record<string, string>`                      | No       | Field-specific errors   |
| `onDismiss` | `() => void`                                  | No       | Dismiss handler         |
| `className` | `string`                                      | No       | Additional CSS classes  |

## Type Variants

| Type      | Background | Border     | Icon       | Text       |
| --------- | ---------- | ---------- | ---------- | ---------- |
| `success` | green-50   | green-200  | green-400  | green-700  |
| `error`   | red-50     | red-200    | red-400    | red-700    |
| `warning` | yellow-50  | yellow-200 | yellow-400 | yellow-700 |
| `info`    | blue-50    | blue-200   | blue-400   | blue-700   |

## Search Patterns for Migration

To find all alert patterns in your codebase:

```bash
# Find success/error conditional patterns
grep -r "result\.success.*bg-green-50.*bg-red-50" src/
grep -r "bg-green-50.*border.*border-green-200" src/
grep -r "bg-red-50.*border.*border-red-200" src/

# Find icon patterns with messages
grep -r "text-green-400.*mr-2.*svg" src/
grep -r "text-red-400.*mr-2.*svg" src/

# Find error mapping patterns
grep -r "Object\.entries.*errors.*map" src/

# Using ripgrep for better results
rg "className.*rounded-xl.*p-4.*bg-(green|red|blue|yellow)-50" --type tsx
```

## Common Migration Patterns

### Pattern 1: Conditional Success/Error

```tsx
// Look for: result.success ? 'bg-green-50' : 'bg-red-50'
// Replace with: <AlertMessage type={result.success ? 'success' : 'error'} />
```

### Pattern 2: Error Details Display

```tsx
// Look for: Object.entries(errors).map
// Replace with: <AlertMessage errors={errors} />
```

### Pattern 3: Dismissible Alerts

```tsx
// Look for: onClick={() => setSomething(null)}
// Replace with: <AlertMessage onDismiss={() => setSomething(null)} />
```

## Important Notes

1. **Message Format**: The component expects a single message string. If you have title + description, combine them
2. **Error Object**: The `errors` prop expects an object with field names as keys
3. **Icons**: Icons are built-in based on type, no need to pass them
4. **Dismiss Button**: Only shows when `onDismiss` is provided
5. **Accessibility**: Component includes proper ARIA attributes

## Testing After Migration

1. **Visual Check**: Ensure colors and icons match the design
2. **Error Display**: Verify field errors show correctly
3. **Dismiss Function**: Test dismiss button if applicable
4. **Responsive**: Check appearance on different screens
5. **State Management**: Ensure alert shows/hides properly

## Edge Cases

### Multi-line Messages

If you need multi-line messages, include line breaks in the message string:

```tsx
<AlertMessage
  type="info"
  message={`Line 1 of the message.
Line 2 with more details.`}
/>
```

### Custom Styling

Use the `className` prop for spacing or custom positioning:

```tsx
<AlertMessage type="error" message="Error occurred" className="mt-4 mb-6" />
```

### Complex Content

If you need more complex content (headings, lists, etc.), consider keeping the original implementation or extending the component.

## Migration Checklist

- [ ] Import AlertMessage component
- [ ] Identify alert pattern (success/error, info, warning)
- [ ] Replace conditional styling with `type` prop
- [ ] Move message content to `message` prop
- [ ] Move field errors to `errors` prop if present
- [ ] Add `onDismiss` if dismissible
- [ ] Remove old SVG icons and styling
- [ ] Test the migration
- [ ] Remove unused imports

## Questions or Issues?

If you encounter patterns not covered here:

1. Check if it needs a new alert type
2. Consider if custom styling can solve it
3. Evaluate if the pattern should remain custom
4. Open a PR to extend the component if widely used
