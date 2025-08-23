# Multi-Tab Locale Handling Fix

## Problem

When users have multiple browser tabs open with different language settings, form submissions would use the global cookie locale instead of the tab's current language. This caused validation error messages to appear in the wrong language.

## Solution

We implemented explicit locale passing from client forms to server actions:

### 1. Created Form Locale Utilities (`src/lib/utils/form-locale.ts`)

```typescript
// Append locale to FormData for server actions
export function appendLocaleToFormData(
  formData: FormData,
  locale: string,
): FormData;
// Extract locale from FormData with fallback
export function getLocaleFromFormData(
  formData: FormData,
  fallback: string = "en",
): string;
```

### 2. Updated Server Actions

All server actions now:

- Extract locale from form data first
- Fall back to cookie locale only if no form locale provided
- Use the correct locale for translations

Example:

```typescript
const formLocale = getLocaleFromFormData(formData);
const cookieLocale = await getCurrentLocale();
const locale = formLocale !== "en" ? formLocale : cookieLocale;
const t = await getTranslations({ locale, namespace: "validation" });
```

### 3. Updated Client Components

All form-submitting components now append locale:

```typescript
const formData = new FormData(e.currentTarget);
appendLocaleToFormData(formData, locale);
const actionResult = await serverAction(formData);
```

## Updated Components

### Server Actions (with locale support):

- `registerUser`
- `deleteUserAccount`
- `addPasswordToGoogleUser`
- `changeUserPassword`

### Client Components (appending locale):

- `RegistrationForm`
- `AccountManagement`

## Testing

To test multi-tab scenarios:

1. Open the app in multiple browser tabs
2. Set different languages in each tab
3. Submit forms with validation errors
4. Verify error messages match each tab's language
5. Confirm no language "bleeding" between tabs

## Benefits

- Consistent user experience across multiple tabs
- Accurate error message translations
- No reliance on global cookie state for form submissions
- Better support for multilingual users

## Technical Details

The solution prioritizes explicit locale from form data over implicit cookie locale. This ensures that each form submission uses the language context from its originating tab, regardless of cookie state changes from other tabs.
