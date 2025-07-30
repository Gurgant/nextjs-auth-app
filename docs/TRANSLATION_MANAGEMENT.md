# 🌍 Translation Management Best Practices

## **Overview**
This document outlines the best practices for managing translations in the Next.js Authentication App to prevent translation errors and ensure consistency across all supported languages.

## **Supported Languages**
- **English (en)** - Base language 🇺🇸
- **Spanish (es)** - Español 🇪🇸  
- **French (fr)** - Français 🇫🇷
- **Italian (it)** - Italiano 🇮🇹
- **German (de)** - Deutsch 🇩🇪

---

## **🔧 Translation Structure**

### **File Organization**
```
messages/
├── en.json    # Base language (English)
├── es.json    # Spanish translations
├── fr.json    # French translations  
├── it.json    # Italian translations
└── de.json    # German translations
```

### **Translation Schema**
```json
{
  "Auth": {
    "signInWithGoogle": "...",
    "signOut": "...",
    // ... auth-related translations
  },
  "Dashboard": {
    "title": "...",
    "message": "...",
    // ... dashboard-related translations
  },
  "Home": {
    "title": "...",
    "subtitle": "...",
    // ... home page translations
  },
  "Common": {
    "loading": "...",
    "error": "...",
    // ... common UI elements
  },
  "Registration": {
    "title": "...",
    "createAccount": "...",
    // ... registration form translations
  },
  "Account": {
    "title": "...",
    "deleteAccount": "...",
    // ... account management translations
  }
}
```

---

## **📋 BEST PRACTICES**

### **1. Translation Development Workflow**

#### **Step 1: Add to Base Language (English)**
Always add new translation keys to `messages/en.json` first:
```json
{
  "NewFeature": {
    "title": "New Feature Title",
    "description": "Feature description"
  }
}
```

#### **Step 2: Validate Before Adding to Other Languages**
Run validation to see what needs translation:
```bash
pnpm validate-translations
```

#### **Step 3: Add to All Other Languages**
Complete the translation in all supported languages:
- Spanish (`es.json`)
- French (`fr.json`) 
- Italian (`it.json`)
- German (`de.json`)

#### **Step 4: Validate Again**
Ensure all translations are complete:
```bash
pnpm validate-translations
```

### **2. Naming Conventions**

#### **Key Structure**
- Use **PascalCase** for section names: `Auth`, `Dashboard`, `Registration`
- Use **camelCase** for individual keys: `signInWithGoogle`, `createAccount`
- Use descriptive names that indicate the content purpose

#### **Parameterized Translations**
For dynamic content, use ICU message format:
```json
{
  "welcome": "Welcome, {name}!",
  "itemCount": "You have {count} items"
}
```

### **3. Content Guidelines**

#### **Context-Aware Translations**
- Consider cultural differences in messaging
- Adapt tone and formality for each language
- Ensure translations fit UI space constraints

#### **Consistency**
- Use consistent terminology across the app
- Maintain the same tone and voice per language
- Follow each language's grammatical rules

### **4. Quality Assurance**

#### **Pre-Commit Validation**
```bash
pnpm pre-commit  # Runs: translations + typecheck + lint
```

#### **Manual Testing**
Test each language in the browser:
- http://localhost:3000/en (English)
- http://localhost:3000/es (Spanish)  
- http://localhost:3000/fr (French)
- http://localhost:3000/it (Italian)
- http://localhost:3000/de (German)

---

## **🛠️ Available Scripts**

### **Translation Validation**
```bash
pnpm validate-translations
```
**Purpose:** Checks all translation files for missing or extra keys compared to the base English file.

**Output:**
- ✅ Success: All languages synchronized
- ❌ Failure: Shows missing/extra keys per language

### **Pre-Commit Check**
```bash
pnpm pre-commit
```
**Purpose:** Runs complete validation before committing:
1. Translation validation
2. TypeScript type checking  
3. ESLint code linting

---

## **🚨 Common Issues & Solutions**

### **Issue 1: Missing Translation Keys**
**Problem:** `MISSING_MESSAGE: Could not resolve 'Auth.newKey' in messages for locale 'es'`

**Solution:**
1. Run `pnpm validate-translations` to see all missing keys
2. Add the missing keys to the respective language files
3. Re-run validation to confirm fixes

### **Issue 2: Inconsistent Key Structure**
**Problem:** Some languages have extra or differently named keys

**Solution:**
1. Use the validation script to identify inconsistencies
2. Ensure all language files match the English structure exactly
3. Remove or rename keys to match the base structure

### **Issue 3: Parameterized Translation Errors**
**Problem:** Dynamic values not displaying correctly

**Solution:**
```json
// ❌ Wrong
"welcome": "Welcome, " + name + "!"

// ✅ Correct  
"welcome": "Welcome, {name}!"
```

---

## **📚 Adding New Languages**

### **Step 1: Create Translation File**
Create new file: `messages/[locale].json`

### **Step 2: Update i18n Configuration**
Update `src/i18n.ts`:
```typescript
export const locales = ['en', 'es', 'fr', 'it', 'de', 'pt'] as const
```

### **Step 3: Update Language Selector**
Update `src/components/language-selector.tsx`:
```typescript
const languages = {
  // ... existing languages
  pt: { 
    code: 'PT', 
    name: 'Portuguese', 
    nativeName: 'Português',
    region: 'Portugal'
  }
}
```

### **Step 4: Update Validation Script**
Update `scripts/validate-translations.js`:
```javascript
const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'it', 'de', 'pt'];
```

### **Step 5: Complete All Translations**
Copy the English structure and translate all keys.

---

## **🔗 Related Documentation**

- [next-intl Documentation](https://next-intl-docs.vercel.app/)
- [ICU Message Format](https://formatjs.io/docs/core-concepts/icu-syntax/)
- [Internationalization Best Practices](https://developer.mozilla.org/en-US/docs/Mozilla/Localization)

---

## **✅ Checklist Before Deployment**

- [ ] All translation files have the same key structure
- [ ] `pnpm validate-translations` passes without errors
- [ ] All languages tested in browser
- [ ] No hardcoded English text in components
- [ ] Parameterized translations work correctly
- [ ] Cultural considerations addressed per language

---

**🎯 Remember:** The base language (English) is the source of truth. All other languages must match its structure exactly to prevent runtime errors.