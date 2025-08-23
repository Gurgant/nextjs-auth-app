# InputWithIcon Component Migration Guide

## Overview

This guide helps you migrate from inline input + icon patterns to the reusable `InputWithIcon` component.

## Import Statement

```tsx
import { InputWithIcon } from "@/components/ui/input-with-icon";
```

## Migration Examples

### Example 1: Email Input

**BEFORE:**

```tsx
<div>
  <label
    htmlFor="email"
    className="block text-sm font-semibold text-gray-700 mb-2"
  >
    {t("emailLabel")}
  </label>
  <div className="relative">
    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
      <svg
        className="h-5 w-5 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
        />
      </svg>
    </div>
    <input
      id="email"
      type="email"
      value={email}
      onChange={(e) => setEmail(e.target.value)}
      required
      className="block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
      placeholder={t("emailPlaceholder")}
    />
  </div>
</div>
```

**AFTER:**

```tsx
<InputWithIcon
  icon="mail"
  type="email"
  id="email"
  label={t("emailLabel")}
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  required
  placeholder={t("emailPlaceholder")}
  focusRing="blue"
/>
```

### Example 2: Password Input with Toggle

**BEFORE:**

```tsx
<div>
  <label
    htmlFor="password"
    className="block text-sm font-semibold text-gray-700 mb-2"
  >
    {t("passwordLabel")}
  </label>
  <div className="relative">
    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
      <svg
        className="h-5 w-5 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
    </div>
    <input
      id="password"
      type="password"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      required
      className="block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
      placeholder={t("passwordPlaceholder")}
    />
  </div>
</div>
```

**AFTER:**

```tsx
<InputWithIcon
  icon="lock"
  type="password"
  id="password"
  label={t("passwordLabel")}
  value={password}
  onChange={(e) => setPassword(e.target.value)}
  required
  placeholder={t("passwordPlaceholder")}
  focusRing="green"
  showPasswordToggle
/>
```

### Example 3: Input with Error State

**BEFORE:**

```tsx
<div>
  <label
    htmlFor="email"
    className="block text-sm font-semibold text-gray-700 mb-2"
  >
    {t("emailAddress")}
  </label>
  <div className="relative">
    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
      <svg
        className="h-5 w-5 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
        />
      </svg>
    </div>
    <input
      id="email"
      name="email"
      type="email"
      required
      className="block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
      placeholder={t("emailPlaceholder")}
    />
  </div>
  {result?.errors?.email && (
    <p className="mt-1 text-sm text-red-600">{result.errors.email}</p>
  )}
</div>
```

**AFTER:**

```tsx
<InputWithIcon
  icon="mail"
  type="email"
  id="email"
  name="email"
  label={t("emailAddress")}
  required
  placeholder={t("emailPlaceholder")}
  focusRing="green"
  error={result?.errors?.email}
/>
```

### Example 4: Name/User Input

**BEFORE:**

```tsx
<div className="relative">
  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
    <svg
      className="h-5 w-5 text-gray-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  </div>
  <input
    id="name"
    name="name"
    type="text"
    required
    className="block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
    placeholder={t("namePlaceholder")}
  />
</div>
```

**AFTER:**

```tsx
<InputWithIcon
  icon="user"
  type="text"
  id="name"
  name="name"
  required
  placeholder={t("namePlaceholder")}
  focusRing="green"
/>
```

## Props Reference

| Prop                 | Type                                              | Required | Default  | Description                     |
| -------------------- | ------------------------------------------------- | -------- | -------- | ------------------------------- |
| `icon`               | `'mail' \| 'lock' \| 'user' \| 'key' \| 'shield'` | Yes      | -        | Icon to display                 |
| `type`               | `string`                                          | No       | `'text'` | Input type                      |
| `error`              | `string`                                          | No       | -        | Error message to display        |
| `focusRing`          | `'blue' \| 'green' \| 'purple' \| 'red'`          | No       | `'blue'` | Focus ring color                |
| `showPasswordToggle` | `boolean`                                         | No       | `false`  | Show password visibility toggle |
| `label`              | `string`                                          | No       | -        | Label text for the input        |
| `srOnlyLabel`        | `boolean`                                         | No       | `false`  | Make label screen-reader only   |
| `...props`           | `InputHTMLAttributes`                             | No       | -        | All standard input props        |

## Icon Mapping

| Icon Value | Use Case                | SVG Path          |
| ---------- | ----------------------- | ----------------- |
| `mail`     | Email inputs            | Email/@ icon      |
| `lock`     | Password inputs         | Lock/padlock icon |
| `user`     | Name/username inputs    | Person silhouette |
| `key`      | API keys, tokens        | Key icon          |
| `shield`   | Security-related inputs | Shield icon       |

## Search Patterns for Migration

```bash
# Find email inputs with icons
rg "type=[\"']email[\"'].*relative" --type tsx
rg "svg.*text-gray-400.*input" --type tsx

# Find password inputs
rg "type=[\"']password[\"'].*relative" --type tsx

# Find inputs with error messages below
rg "mt-1.*text-sm.*text-red-600" --type tsx -B5 -A2

# Find all input patterns with icons
rg "absolute.*inset-y-0.*left-0.*pl-3" --type tsx
```

## Common Migration Patterns

### Pattern 1: Basic Input with Icon

```tsx
// Look for: <div className="relative"> with nested icon and input
// Replace with: <InputWithIcon icon="..." />
```

### Pattern 2: Input with Label

```tsx
// Look for: <label> followed by <div className="relative">
// Replace with: <InputWithIcon label="..." />
```

### Pattern 3: Input with Error

```tsx
// Look for: Input followed by conditional error paragraph
// Replace with: <InputWithIcon error={errors.field} />
```

## Migration Checklist

- [ ] Import InputWithIcon component
- [ ] Identify the icon type (mail, lock, user, etc.)
- [ ] Determine focus ring color from existing classes
- [ ] Check if password toggle is needed
- [ ] Move label text to `label` prop
- [ ] Move error message to `error` prop
- [ ] Transfer all input attributes (name, id, value, onChange, etc.)
- [ ] Remove old HTML structure
- [ ] Test the migrated component

## Important Notes

1. **Icon Selection**: Choose the appropriate icon based on the input purpose
2. **Focus Ring Color**: Match the existing focus ring color for consistency
3. **Password Toggle**: Only add for actual password fields where users benefit
4. **Accessibility**: The component handles ARIA attributes automatically
5. **Error States**: The component manages error styling and announcements

## Testing After Migration

1. **Visual Check**: Ensure the input looks the same
2. **Interaction**: Test focus, hover, and error states
3. **Functionality**: Verify onChange handlers work
4. **Password Toggle**: Test show/hide functionality if applicable
5. **Error Display**: Confirm error messages appear correctly
6. **Accessibility**: Test with keyboard navigation

## Special Cases

### Verification Code Inputs

Verification code inputs (6-digit codes) have special styling and don't use icons. Keep these as-is unless creating a specialized component.

### Custom Icons

If you need icons not in the predefined set, consider:

1. Adding to the component's icon map
2. Creating a variant for special cases
3. Using a separate specialized component

## Example Migration Script

```bash
# Step 1: Find all files with input patterns
rg -l "absolute.*inset-y-0.*left-0.*pl-3" --type tsx

# Step 2: For each file, identify the pattern and migrate
# Step 3: Run TypeScript check after each file
pnpm tsc --noEmit

# Step 4: Test the application
pnpm dev
```

## Questions or Issues?

If you encounter patterns not covered here:

1. Check if it needs a new icon type
2. Consider if it's a special case requiring custom handling
3. Update this guide with new patterns discovered
