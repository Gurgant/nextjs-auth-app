# Migration Guide: Form Response Utilities

## Overview

This guide helps you migrate from manual response object creation to using the standardized form-responses utilities.

## Quick Reference

### Import the utilities

```typescript
import {
  createErrorResponse,
  createSuccessResponse,
  createValidationErrorResponse,
  createFieldErrorResponse,
  createGenericErrorResponse,
  logActionError,
  isErrorResponse,
  isSuccessResponse,
  hasFieldErrors,
  getFieldError,
  getAllFieldErrors,
  type ActionResponse,
} from "@/lib/utils/form-responses";
```

### Replace ActionResult interface

**Before:**

```typescript
export interface ActionResult {
  success: boolean;
  message?: string;
  errors?: Record<string, string>;
  data?: any;
}
```

**After:**

```typescript
// Using ActionResponse from form-responses instead of ActionResult
export type ActionResult = ActionResponse;
```

## Common Migration Patterns

### 1. Basic Error Response

**Before:**

```typescript
return {
  success: false,
  message: "Something went wrong",
};
```

**After:**

```typescript
return createErrorResponse("Something went wrong");
```

### 2. User Not Found Error

**Before:**

```typescript
if (!user) {
  return {
    success: false,
    message: "User not found",
  };
}
```

**After:**

```typescript
if (!user) {
  return createGenericErrorResponse("notFound", "User not found");
}
```

### 3. Field-specific Errors

**Before:**

```typescript
return {
  success: false,
  message: "Invalid credentials",
  errors: { password: "Incorrect password" },
};
```

**After:**

```typescript
return createFieldErrorResponse(
  "Invalid credentials",
  "password",
  "Incorrect password",
);
```

### 4. Validation Errors (Zod)

**Before:**

```typescript
if (error instanceof z.ZodError) {
  const errors = await translateValidationErrors(error, locale);
  return {
    success: false,
    message: t("form.validationError"),
    errors,
  };
}
```

**After:**

```typescript
if (error instanceof z.ZodError) {
  return createValidationErrorResponse(error, locale);
}
```

### 5. Success Response

**Before:**

```typescript
return {
  success: true,
  message: "Operation successful",
};
```

**After:**

```typescript
return createSuccessResponse("Operation successful");
```

### 6. Success Response with Data

**Before:**

```typescript
return {
  success: true,
  message: "Data retrieved",
  data: {
    userId: user.id,
    email: user.email,
  },
};
```

**After:**

```typescript
return createSuccessResponse("Data retrieved", {
  userId: user.id,
  email: user.email,
});
```

### 7. Error Logging

**Before:**

```typescript
console.error("Function error:", error);
```

**After:**

```typescript
logActionError("functionName", error);
```

### 8. Try-Catch Block Pattern

**Before:**

```typescript
} catch (error) {
  console.error("Registration error:", error);

  if (error instanceof z.ZodError) {
    // Handle validation errors
    const errors = await translateValidationErrors(error, locale);
    return {
      success: false,
      message: t("form.validationError"),
      errors
    };
  }

  return {
    success: false,
    message: "Something went wrong. Please try again."
  };
}
```

**After:**

```typescript
} catch (error) {
  const locale = await resolveFormLocale(formData);

  if (error instanceof z.ZodError) {
    return createValidationErrorResponse(error, locale);
  }

  logActionError('registerUser', error);
  return createGenericErrorResponse('unknown');
}
```

## Component Migration

### Accessing Errors in Components

**Before:**

```typescript
{result?.errors?.email && (
  <p className="text-red-600">{result.errors.email}</p>
)}
```

**After:**

```typescript
import { isErrorResponse, getFieldError } from '@/lib/utils/form-responses';

{result && isErrorResponse(result) && getFieldError(result, 'email') && (
  <p className="text-red-600">{getFieldError(result, 'email')}</p>
)}
```

### Displaying All Field Errors

**Before:**

```typescript
{result?.errors && (
  <div>
    {Object.entries(result.errors).map(([field, error]) => (
      <p key={field} className="text-red-600">{error}</p>
    ))}
  </div>
)}
```

**After:**

```typescript
import { isErrorResponse, getAllFieldErrors } from '@/lib/utils/form-responses';

{result && isErrorResponse(result) && getAllFieldErrors(result).length > 0 && (
  <div>
    {getAllFieldErrors(result).map((error, index) => (
      <p key={index} className="text-red-600">{error}</p>
    ))}
  </div>
)}
```

### State Type Updates

**Before:**

```typescript
const [result, setResult] = useState<ActionResult | null>(null);
```

**After:**

```typescript
import { type ActionResponse } from "@/lib/utils/form-responses";

const [result, setResult] = useState<ActionResponse | null>(null);
```

## Migration Checklist

- [ ] Import form-responses utilities
- [ ] Replace ActionResult interface with ActionResponse type
- [ ] Update all error returns to use createErrorResponse
- [ ] Replace "User not found" with createGenericErrorResponse
- [ ] Convert field errors to createFieldErrorResponse
- [ ] Replace Zod error handling with createValidationErrorResponse
- [ ] Update success returns to use createSuccessResponse
- [ ] Replace console.error with logActionError
- [ ] Update components to use type guards (isErrorResponse, etc.)
- [ ] Update state types from ActionResult to ActionResponse
- [ ] Remove translateValidationErrors imports (handled internally)
- [ ] Clean up unused imports

## Benefits

1. **Type Safety**: Discriminated unions ensure proper type checking
2. **Consistency**: Same pattern everywhere
3. **Less Code**: ~200-300 lines reduced
4. **Better Logging**: Centralized error logging with context
5. **Internationalization**: Built-in support for translations
6. **Maintainability**: Changes in one place affect all responses

## Common Gotchas

1. **Type Casting**: When using functions that haven't been migrated yet, you may need to cast:

   ```typescript
   setResult(unmigratredFunction() as ActionResponse);
   ```

2. **Field Access**: Always use type guards before accessing errors:

   ```typescript
   // Wrong
   result.errors?.email;

   // Right
   result && isErrorResponse(result) && getFieldError(result, "email");
   ```

3. **Import Cleanup**: Remove unused imports after migration:
   - `translateValidationErrors` (now handled internally)
   - Local ActionResult interfaces

## Example: Complete Function Migration

**Before:**

```typescript
export async function updateProfile(formData: FormData): Promise<ActionResult> {
  try {
    const name = formData.get("name") as string;

    if (!name || name.trim().length < 2) {
      return {
        success: false,
        message: "Name must be at least 2 characters",
        errors: { name: "Name must be at least 2 characters" },
      };
    }

    // Update logic...

    return {
      success: true,
      message: "Profile updated successfully",
    };
  } catch (error) {
    console.error("Update profile error:", error);
    return {
      success: false,
      message: "Failed to update profile",
    };
  }
}
```

**After:**

```typescript
export async function updateProfile(formData: FormData): Promise<ActionResult> {
  try {
    const name = formData.get("name") as string;

    if (!name || name.trim().length < 2) {
      return createFieldErrorResponse(
        "Name must be at least 2 characters",
        "name",
        "Name must be at least 2 characters",
      );
    }

    // Update logic...

    return createSuccessResponse("Profile updated successfully");
  } catch (error) {
    logActionError("updateProfile", error);
    return createErrorResponse("Failed to update profile");
  }
}
```

This migration improves code consistency, type safety, and maintainability across the entire codebase.
