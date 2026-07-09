# Form State Management Migration Guide

## Overview

This guide documents the migration patterns for implementing DRY (Don't Repeat Yourself) principles in form state management using custom React hooks.

## Created Hooks

### 1. `useActionState`

A base hook for managing async action state with loading, error, and result management.

**Features:**

- Automatic loading state management
- Result state with success/error handling
- Configurable callbacks (onSuccess, onError)
- Auto-reset functionality
- TypeScript generic support

### 2. `useLocalizedAction`

A wrapper around `useActionState` that automatically injects locale into FormData.

**Features:**

- Automatic locale injection for FormData
- Preserves all `useActionState` functionality
- Ensures i18n consistency

**Usage:**

```typescript
const { execute, isLoading, result } = useLocalizedAction(
  async (formData: FormData) => someAction(formData, additionalParam),
  locale,
  {
    onSuccess: (data) => {
      // Handle success
    },
  },
);
```

### 3. `useFormReset`

Manages form reset functionality with proper error handling.

**Features:**

- Safe form reset with error boundaries
- Custom reset callbacks
- TypeScript safety

**Usage:**

```typescript
const { formRef, resetForm } = useFormReset({
  formName: "MyForm",
  onReset: () => {
    // Clear additional state
  },
});
```

### 4. `useMultiStepForm`

Manages complex multi-step form workflows.

**Features:**

- Step navigation (next, previous, goTo)
- Per-step validation with Zod schemas
- Progress tracking
- Step data persistence
- TypeScript generics for step data

## Migration Patterns

### Pattern 1: FormData-based Actions

**Before:**

```typescript
const [isLoading, setIsLoading] = useState(false);
const [result, setResult] = useState<ActionResult | null>(null);

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsLoading(true);
  setResult(null);

  try {
    const formData = new FormData(e.currentTarget);
    appendLocaleToFormData(formData, locale);
    const actionResult = await someAction(formData);
    setResult(actionResult);

    if (actionResult.success) {
      // Handle success
    }
  } catch (error) {
    setResult({ success: false, message: "Error occurred" });
  } finally {
    setIsLoading(false);
  }
};
```

**After:**

```typescript
const { execute, isLoading, result } = useLocalizedAction(someAction, locale, {
  onSuccess: () => {
    // Handle success
  },
});

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  const formData = new FormData(e.currentTarget);
  await execute(formData);
};
```

### Pattern 2: Non-FormData Actions

**Important:** Do NOT use `useLocalizedAction` for actions that don't use FormData.

**Keep as-is:**

```typescript
// Direct parameter actions like sendEmailVerification
const handleSendVerification = async () => {
  setIsLoading(true);
  try {
    const result = await sendEmailVerification(user.email, locale);
    setResult(result);
  } catch (error) {
    // Handle error
  } finally {
    setIsLoading(false);
  }
};
```

### Pattern 3: Form Reset

**Before:**

```typescript
const formRef = useRef<HTMLFormElement>(null);

const resetForm = () => {
  if (formRef.current) {
    formRef.current.reset();
  }
};
```

**After:**

```typescript
const { formRef, resetForm } = useFormReset({
  formName: "MyForm",
  onReset: () => {
    // Clear additional state if needed
  },
});
```

## Best Practices

### 1. **Preserve Functionality First**

- Never sacrifice functionality for DRY principles
- Locale preservation is critical for i18n
- Test thoroughly after migration

### 2. **Choose the Right Hook**

- Use `useLocalizedAction` ONLY for FormData-based actions
- Keep manual implementation for direct parameter actions
- Consider semantic correctness over forced consistency

### 3. **Type Safety**

- Leverage TypeScript generics in hooks
- Maintain strong typing throughout migration
- Use discriminated unions for response types

### 4. **Error Handling**

- Hooks include built-in error handling
- Use onError callbacks for custom error handling
- Preserve user-facing error messages

### 5. **Testing**

- All hooks have comprehensive test suites
- Test migrated components thoroughly
- Ensure backward compatibility

## Migration Checklist

- [ ] Identify action type (FormData vs direct parameters)
- [ ] Choose appropriate hook or keep manual implementation
- [ ] Update imports to include necessary hooks
- [ ] Migrate state management to hooks
- [ ] Update event handlers to use hook methods
- [ ] Add locale prop if component needs it
- [ ] Test all functionality
- [ ] Remove unused imports and code

## Common Pitfalls

1. **Using `useLocalizedAction` for non-FormData actions**
   - This creates unnecessary FormData objects
   - Breaks semantic correctness
   - Can cause type mismatches

2. **Forgetting to pass locale prop**
   - Components using `useLocalizedAction` need locale
   - Update parent components to pass locale

3. **Not handling all callback scenarios**
   - Remember to migrate success/error callbacks
   - Use hook options for callbacks

4. **Breaking existing functionality**
   - Always test after migration
   - Preserve all existing behavior
