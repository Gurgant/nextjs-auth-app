# i18n Best Practices Guide

## Overview

This guide outlines best practices for implementing and maintaining internationalization (i18n) in our Next.js authentication application.

## Core Principles

### 1. **Always Preserve Locale**

- Extract locale from FormData in all server actions
- Pass locale through the entire error handling chain
- Never hardcode locale values

### 2. **Fail Gracefully**

- Always provide fallback messages
- Handle translation errors without breaking functionality
- Use default language (English) as ultimate fallback

### 3. **Maintain Type Safety**

- Use TypeScript for all i18n utilities
- Define types for translation namespaces
- Leverage discriminated unions for responses

## Implementation Patterns

### Server Actions with FormData

```typescript
export async function someAction(formData: FormData): Promise<ActionResponse> {
  try {
    // Your action logic here

    return createSuccessResponse("Success message");
  } catch (error) {
    // ALWAYS extract locale for error handling
    const locale = await resolveFormLocale(formData);

    if (error instanceof z.ZodError) {
      return createValidationErrorResponse(error, locale);
    }

    // Use i18n version for full translation support
    return createErrorResponseI18n("errorKey", locale);
  }
}
```

### Direct Parameter Actions

```typescript
export async function someAction(
  param: string,
  locale: string,
): Promise<ActionResponse> {
  try {
    // Your action logic here

    // For direct parameter actions, locale is passed explicitly
    return createSuccessResponseI18n("successKey", undefined, locale);
  } catch (error) {
    // Use the explicitly passed locale
    return createErrorResponseI18n("errorKey", locale);
  }
}
```

### Component-Level Patterns

```typescript
// For FormData-based actions
const { execute, isLoading, result } = useLocalizedAction(
  someFormAction,
  locale,
);

// For non-FormData actions, handle manually
const handleDirectAction = async () => {
  setLoading(true);
  try {
    const result = await someDirectAction(param, locale);
    setResult(result);
  } catch (error) {
    // Handle error
  } finally {
    setLoading(false);
  }
};
```

## Translation Key Conventions

### Naming Structure

```
namespace.category.specificMessage
```

Examples:

- `Errors.auth.invalidCredentials`
- `Errors.twoFactor.notEnabled`
- `Success.profile.updated`

### Key Guidelines

1. Use camelCase for keys
2. Be descriptive but concise
3. Group related messages
4. Avoid abbreviations

## File Organization

### Locale Files Structure

```
messages/
├── en.json
├── es.json
├── fr.json
├── de.json
└── it.json
```

### Each locale file should have:

```json
{
  "Common": {
    // Shared UI strings
  },
  "Errors": {
    // All error messages
  },
  "Success": {
    // Success messages
  },
  "Validation": {
    // Form validation messages
  }
}
```

## Migration Strategy

### Phase 1: Infrastructure (COMPLETED)

- ✅ Create server-side translation helpers
- ✅ Add i18n-enabled error response utilities
- ✅ Update locale files with error messages

### Phase 2: Gradual Migration

1. Start with most user-facing errors
2. Update one file at a time
3. Test each migration thoroughly
4. Monitor for untranslated messages

### Phase 3: Full Implementation

1. Replace all hardcoded messages
2. Add missing translations
3. Set up translation management workflow
4. Implement locale detection improvements

## Testing i18n

### Unit Tests

```typescript
describe("Error responses with i18n", () => {
  it("should return translated error message", async () => {
    const response = await createErrorResponseI18n("userNotFound", "es");
    expect(response.message).toBe("Usuario no encontrado");
  });

  it("should fallback to English on missing translation", async () => {
    const response = await createErrorResponseI18n("userNotFound", "xx");
    expect(response.message).toBe("User not found");
  });
});
```

### Integration Tests

- Test all supported locales
- Verify FormData locale extraction
- Check error message translations
- Validate fallback behavior

## Performance Considerations

### Caching

- Cache translations at the module level
- Use Next.js built-in caching for static translations
- Consider Redis for dynamic translations

### Bundle Size

- Load only necessary translations
- Use dynamic imports for large translation files
- Split translations by route/feature

## Common Pitfalls to Avoid

### ❌ Don't Do This

```typescript
// Hardcoded messages
return createErrorResponse("User not found");

// Forgetting locale extraction
catch (error) {
  return createErrorResponse("An error occurred");
}

// Mixing sync and async inconsistently
const result = createErrorResponse(message); // Sometimes sync
const result = await createErrorResponseI18n(key, locale); // Sometimes async
```

### ✅ Do This Instead

```typescript
// Use translation keys
return createErrorResponseI18n("userNotFound", locale);

// Always extract locale in error handlers
catch (error) {
  const locale = await resolveFormLocale(formData);
  return createErrorResponseI18n("genericError", locale);
}

// Be consistent with async patterns
const result = await createErrorResponseI18n(key, locale);
```

## Debugging i18n Issues

### Check These First

1. Is locale being extracted correctly?
2. Does the translation key exist?
3. Is the namespace correct?
4. Are you using the right utility function?

### Debug Helpers

```typescript
// Log locale extraction
const locale = await resolveFormLocale(formData);
console.log("Extracted locale:", locale);

// Log translation attempts
try {
  const translated = await translateError(locale, key);
  console.log(`Translation [${locale}][${key}]:`, translated);
} catch (error) {
  console.error("Translation failed:", error);
}
```

## Future Enhancements

### Short Term

1. Add pluralization support
2. Implement interpolation for dynamic values
3. Create translation linting rules

### Long Term

1. Set up professional translation workflow
2. Implement automatic translation key extraction
3. Add locale-based formatting (dates, numbers)
4. Create translation dashboard

## Resources

### Internal Documentation

- [Form State Management Migration Guide](./form-state-management-migration.md)
- [i18n Improvement Progress Report](./i18n-improvement-progress.md)

### External Resources

- [Next.js i18n Documentation](https://nextjs.org/docs/app/building-your-application/routing/internationalization)
- [next-intl Documentation](https://next-intl-docs.vercel.app/)

## Checklist for New Features

When adding new features with user-facing messages:

- [ ] Use translation keys instead of hardcoded strings
- [ ] Add keys to all locale files
- [ ] Extract locale in error handlers
- [ ] Use appropriate i18n utility functions
- [ ] Test with multiple locales
- [ ] Handle missing translations gracefully
- [ ] Document any new translation patterns
- [ ] Update this guide if needed
