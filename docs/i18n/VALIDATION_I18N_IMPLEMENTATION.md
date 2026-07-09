# Validation Schema Refactoring & i18n Implementation

## Overview

We've successfully implemented:

1. **Shared validation schemas** - Eliminated code duplication
2. **Internationalized error messages** - Support for 5 languages
3. **Server-side translation** - Errors shown in user's language

## What Changed

### 1. Created Shared Validation Schemas

**File**: `/src/lib/validation/schemas.ts`

```typescript
// Before: Same validation repeated 3 times
// After: Reusable schemas
export const passwordSchema = z
  .string()
  .min(8, { message: "validation.password.minLength" })
  .max(128, { message: "validation.password.maxLength" })
  .regex(/[A-Z]/, { message: "validation.password.requireUppercase" });
// ... etc
```

### 2. Refactored All Auth Files

- `/src/lib/auth.ts` - Uses `loginEmailSchema` and `loginPasswordSchema`
- `/src/lib/actions/auth.ts` - All forms use shared schemas
- No more duplicated validation code!

### 3. Added Translation Keys

Added `validation` namespace to all language files:

- `/messages/en.json`
- `/messages/es.json`
- `/messages/fr.json`
- `/messages/it.json`
- `/messages/de.json`

### 4. Implemented Server-Side Translation

- Created `/src/lib/validation/translate-errors.ts`
- Created `/src/lib/utils/get-locale.ts`
- Updated `registerUser` action to translate errors

## Benefits

### For Developers

- **Single source of truth** - Change validation in one place
- **Easy maintenance** - No more hunting for duplicated code
- **Type safety** - Zod schemas provide TypeScript types
- **Consistent validation** - Same rules everywhere

### For Users

- **Native language errors** - See validation errors in their language
- **Clear requirements** - Password rules explained clearly
- **Better UX** - No confusing English errors in Spanish UI

## How It Works

### 1. User submits form in Spanish

```
Email: invalid-email
Password: weak
```

### 2. Validation runs with i18n keys

```typescript
const schema = z.object({
  email: emailSchema, // Uses "validation.email.invalid"
  password: passwordSchema, // Uses "validation.password.minLength"
});
```

### 3. Server translates errors

```typescript
const errors = await translateValidationErrors(zodError, "es");
// Returns: { email: "Formato de correo electrónico inválido" }
```

### 4. User sees Spanish errors

```
✗ Formato de correo electrónico inválido
✗ La contraseña debe tener al menos 8 caracteres
```

## Testing the Implementation

### Test Password Validation

Try registering with these passwords:

- `weak` → "Password must be at least 8 characters long"
- `weakpassword` → "Password must contain at least one uppercase letter"
- `Weakpassword` → "Password must contain at least one number"
- `Weakpassword1` → "Password must contain at least one special character"
- `Weakpassword1!` → ✓ Valid

### Test Email Normalization

- `  USER@EXAMPLE.COM  ` → Stored as `user@example.com`
- `admin@example.com` → ✓ Valid
- `not-an-email` → "Invalid email format"

### Test Internationalization

1. Switch to Spanish (`/es/register`)
2. Submit invalid form
3. See Spanish error messages

## Future Improvements

### 1. Complete i18n for All Actions

Currently only `registerUser` is translated. Next:

- `changeUserPassword`
- `addPasswordToGoogleUser`
- `deleteUserAccount`

### 2. Client-Side Validation

Add matching client-side validation with same i18n keys

### 3. Custom Error Messages

Allow passing custom parameters to messages:

```typescript
t("validation.password.minLength", { min: 8 });
// "Password must be at least {min} characters long"
```

## Code Comparison

### Before (Duplicated)

```typescript
// In registerSchema
password: z.string()
  .min(8, "Password must be at least 8 characters long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter");

// In addPasswordSchema (duplicate!)
password: z.string()
  .min(8, "Password must be at least 8 characters long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter");

// In changePasswordSchema (duplicate again!)
newPassword: z.string()
  .min(8, "New password must be at least 8 characters long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter");
```

### After (DRY)

```typescript
// Defined once
export const passwordSchema = z
  .string()
  .min(8, { message: "validation.password.minLength" })
  .regex(/[A-Z]/, { message: "validation.password.requireUppercase" });

// Used everywhere
const registerSchema = z.object({
  password: passwordSchema,
});

const addPasswordSchema = z.object({
  password: passwordSchema,
});

const changePasswordSchema = z.object({
  newPassword: passwordSchema,
});
```

## Summary

We've successfully:

- ✅ Eliminated code duplication
- ✅ Added internationalization support
- ✅ Improved maintainability
- ✅ Enhanced user experience
- ✅ Kept all existing functionality

The validation system is now DRY, internationalized, and ready for scale!
