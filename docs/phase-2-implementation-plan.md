# Phase 2 Implementation Plan - Form Utilities & Patterns

## 🎯 Overview

Phase 2 focuses on extracting and standardizing form handling patterns that appear repeatedly throughout the codebase.

## 📊 Current State Analysis

### Pattern 1: Locale Resolution (8 instances found)
```typescript
const formLocale = getLocaleFromFormData(formData);
const cookieLocale = await getCurrentLocale();
const locale = formLocale !== 'en' ? formLocale : cookieLocale;
```
**Files affected**: All auth.ts action handlers

### Pattern 2: Error Response Format
```typescript
return {
  success: false,
  message: t('validationError'),
  errors: validatedData.error.flatten().fieldErrors
};
```
**Estimated instances**: 10-15 across action files

### Pattern 3: Form State Management
- Loading states
- Error handling
- Success messages
- Form reset logic
**Estimated instances**: Every form component

## 📋 Detailed Execution Plan

### Subphase 2.1: Form Locale Utilities

#### Step 1: Create Enhanced Locale Utility
```typescript
// lib/utils/form-locale-enhanced.ts
export async function resolveFormLocale(formData: FormData): Promise<string> {
  const formLocale = getLocaleFromFormData(formData);
  const cookieLocale = await getCurrentLocale();
  return formLocale !== 'en' ? formLocale : cookieLocale;
}
```

#### Step 2: Create Translation Helper
```typescript
export async function getFormTranslations(
  formData: FormData,
  namespace: string
) {
  const locale = await resolveFormLocale(formData);
  return getTranslations({ locale, namespace });
}
```

#### Step 3: Migrate All Instances
1. Replace 8 instances in auth.ts
2. Test each migration
3. Verify locale resolution works

### Subphase 2.2: Form Error Utilities

#### Step 1: Analyze Error Patterns
```bash
# Find all error response patterns
rg "success: false.*message.*errors" --type ts
```

#### Step 2: Create Error Response Builder
```typescript
// lib/utils/form-errors.ts
export interface FormErrorResponse {
  success: false;
  message: string;
  errors?: Record<string, string | string[]>;
}

export function createErrorResponse(
  message: string,
  errors?: ZodError | Record<string, string>
): FormErrorResponse {
  if (errors instanceof ZodError) {
    return {
      success: false,
      message,
      errors: errors.flatten().fieldErrors
    };
  }
  
  return {
    success: false,
    message,
    errors
  };
}
```

#### Step 3: Create Success Response Builder
```typescript
export interface FormSuccessResponse {
  success: true;
  message: string;
  data?: any;
}

export function createSuccessResponse(
  message: string,
  data?: any
): FormSuccessResponse {
  return {
    success: true,
    message,
    data
  };
}
```

### Subphase 2.3: Form State Hooks

#### Step 1: Create useFormSubmit Hook
```typescript
// hooks/use-form-submit.ts
export function useFormSubmit<T>({
  action,
  onSuccess,
  onError
}: FormSubmitOptions<T>) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  
  const handleSubmit = async (formData: FormData) => {
    setIsLoading(true);
    setResult(null);
    
    try {
      const result = await action(formData);
      setResult(result);
      
      if (result.success && onSuccess) {
        onSuccess(result);
      } else if (!result.success && onError) {
        onError(result);
      }
    } catch (error) {
      // Handle unexpected errors
    } finally {
      setIsLoading(false);
    }
  };
  
  return { handleSubmit, isLoading, result };
}
```

#### Step 2: Create useFormErrors Hook
```typescript
// hooks/use-form-errors.ts
export function useFormErrors(result: ActionResult | null) {
  const fieldErrors = result?.errors || {};
  const globalError = result?.message;
  
  const getFieldError = (field: string) => {
    const error = fieldErrors[field];
    return Array.isArray(error) ? error[0] : error;
  };
  
  const hasFieldError = (field: string) => {
    return !!fieldErrors[field];
  };
  
  return {
    fieldErrors,
    globalError,
    getFieldError,
    hasFieldError
  };
}
```

## 🚀 Implementation Steps

### Day 1: Locale Utilities
1. **Morning**: Create enhanced locale utilities
2. **Afternoon**: Write tests for utilities
3. **Evening**: Start migrating auth.ts instances

### Day 2: Error Utilities
1. **Morning**: Create error/success response builders
2. **Afternoon**: Write comprehensive tests
3. **Evening**: Migrate existing patterns

### Day 3: Form Hooks
1. **Morning**: Implement useFormSubmit hook
2. **Afternoon**: Implement useFormErrors hook
3. **Evening**: Create example implementations

### Day 4: Documentation & Testing
1. **Morning**: Create migration guides
2. **Afternoon**: Update all documentation
3. **Evening**: Run full test suite

## 💡 Best Practices for Phase 2

### 1. Utility Design Principles
- **Single Responsibility**: Each utility does one thing well
- **Composable**: Utilities can be combined
- **Tree-shakeable**: Only import what you use
- **Type-safe**: Full TypeScript support

### 2. Migration Strategy
- **Backwards Compatible**: Don't break existing code
- **Incremental**: One pattern at a time
- **Tested**: Write tests before migrating
- **Documented**: Update guides immediately

### 3. Hook Design
- **Predictable**: Consistent API across hooks
- **Flexible**: Support various use cases
- **Performant**: Avoid unnecessary re-renders
- **Accessible**: Include ARIA states

### 4. Testing Approach
- **Unit tests**: For each utility function
- **Integration tests**: For hook behavior
- **Migration tests**: Ensure backwards compatibility
- **Performance tests**: No regression

## 📊 Success Metrics

### Quantitative
- **Pattern instances replaced**: 20-30
- **Lines of code saved**: ~150-200
- **Test coverage**: 100% for utilities
- **Bundle size**: No increase

### Qualitative
- **Developer experience**: Simpler form handling
- **Consistency**: Same patterns everywhere
- **Maintainability**: Central utilities
- **Flexibility**: Easy to extend

## 🎯 Expected Outcomes

1. **Simplified Action Handlers**
   ```typescript
   // Before: 6 lines
   const formLocale = getLocaleFromFormData(formData);
   const cookieLocale = await getCurrentLocale();
   const locale = formLocale !== 'en' ? formLocale : cookieLocale;
   const t = await getTranslations({ locale, namespace: "validation" });
   
   // After: 1 line
   const t = await getFormTranslations(formData, "validation");
   ```

2. **Consistent Error Handling**
   ```typescript
   // Before: Manual construction
   // After: 
   return createErrorResponse(t('validationError'), validatedData.error);
   ```

3. **Simplified Form Components**
   ```typescript
   // Using new hooks
   const { handleSubmit, isLoading, result } = useFormSubmit({
     action: registerUser,
     onSuccess: () => router.push('/dashboard')
   });
   ```

## 🚨 Risks & Mitigations

1. **Risk**: Breaking existing forms
   - **Mitigation**: Comprehensive tests, incremental migration

2. **Risk**: Over-abstraction
   - **Mitigation**: Start simple, extend based on needs

3. **Risk**: Performance regression
   - **Mitigation**: Profile before/after, optimize hot paths

## ✅ Phase 2 Checklist

- [ ] Create locale resolution utilities
- [ ] Write tests for locale utilities
- [ ] Migrate all locale patterns
- [ ] Create error response builders
- [ ] Write tests for error utilities
- [ ] Migrate error patterns
- [ ] Create form hooks
- [ ] Write hook tests
- [ ] Update documentation
- [ ] Create migration guides
- [ ] Run full test suite
- [ ] Update CLAUDE.md

---

**Estimated Duration**: 3-4 days
**Complexity**: Medium
**Impact**: High - significantly cleaner form handling