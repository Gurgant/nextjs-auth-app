# DRY Refactoring - File Impact Analysis

## 🎯 Component Creation & File Updates Map

### 1. LoadingSpinner Component

**New Files to Create:**

```
src/components/ui/loading-spinner.tsx
src/components/ui/__tests__/loading-spinner.test.tsx
```

**Files to Update (8 files, ~100 lines to remove):**
| File | Line Numbers | Current Implementation |
|------|--------------|------------------------|
| `src/components/auth/credentials-form.tsx` | 111-114 | Button loading state |
| `src/components/auth/registration-form.tsx` | 222-225 | Submit button spinner |
| `src/components/auth/two-factor-verification.tsx` | 305-322 | Multiple instances |
| `src/components/security/two-factor-setup.tsx` | 231-234, 365-368 | Two spinners |
| `src/components/account/account-management.tsx` | 717-736, 893-913, 1059-1079, 1702-1720 | Four instances |

### 2. GradientButton Component

**New Files to Create:**

```
src/components/ui/gradient-button.tsx
src/components/ui/__tests__/gradient-button.test.tsx
```

**Files to Update (15+ instances across 6 files):**
| File | Instances | Button Types |
|------|-----------|--------------|
| `src/components/auth/credentials-form.tsx` | 2 | Sign in, Sign up link |
| `src/components/auth/registration-form.tsx` | 2 | Register, Sign in link |
| `src/components/auth/two-factor-verification.tsx` | 2 | Verify, Use backup |
| `src/components/account/account-management.tsx` | 6 | Update, Add password, Change password, Delete, etc. |
| `src/components/security/two-factor-setup.tsx` | 3 | Continue, Enable, Download |

### 3. AlertMessage Component

**New Files to Create:**

```
src/components/ui/alert-message.tsx
src/components/ui/__tests__/alert-message.test.tsx
```

**Files to Update (8 instances):**
| File | Line Numbers | Alert Type |
|------|--------------|------------|
| `src/components/auth/registration-form.tsx` | 189-212 | Success/Error |
| `src/components/auth/two-factor-verification.tsx` | 243-290 | Error with details |
| `src/components/security/two-factor-setup.tsx` | 321-344 | Success/Error |
| `src/components/account/account-management.tsx` | 662-709, 825-885, 992-1052, 1186-1235, 1379-1426, 1630-1679 | Multiple alerts |

### 4. InputWithIcon Component

**New Files to Create:**

```
src/components/ui/input-with-icon.tsx
src/components/ui/__tests__/input-with-icon.test.tsx
```

**Files to Update (12 instances):**
| File | Input Fields |
|------|--------------|
| `src/components/auth/credentials-form.tsx` | Email (with envelope icon), Password (with lock icon) |
| `src/components/auth/registration-form.tsx` | Name (user icon), Email (envelope), Password (lock), Confirm Password (lock) |

### 5. Locale Utilities

**New Files to Create:**

```
src/lib/utils/locale-helpers.ts
src/lib/utils/__tests__/locale-helpers.test.ts
```

**Files to Update:**
| File | Functions to Update | Line Numbers |
|------|-------------------|--------------|
| `src/lib/actions/auth.ts` | `registerUser` | 62-66 |
| | `signInWithCredentials` | 122-125 |
| | `updateUserProfile` | 150-154 |
| | `deleteUserAccount` | 260-264, 280-284 |
| | `addPasswordToGoogleUser` | 333-337, 353-357 |
| | `changeUserPassword` | 447-451, 475-479 |

### 6. Error Handling Utilities

**New Files to Create:**

```
src/lib/utils/error-handlers.ts
src/lib/utils/__tests__/error-handlers.test.ts
```

**Files to Update:**
| File | Error Handling Blocks |
|------|---------------------|
| `src/lib/actions/auth.ts` | 6 try-catch blocks with similar patterns |

### 7. GlassCard Component

**New Files to Create:**

```
src/components/ui/glass-card.tsx
```

**Pattern to Replace:**

```tsx
className =
  "bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20";
```

**Files to Update (8+ instances):**

- All account management sections
- Authentication forms
- Two-factor setup modals

### 8. CenteredPageLayout Component

**New Files to Create:**

```
src/components/layouts/centered-page-layout.tsx
```

**Files to Update:**
| File | Current Layout |
|------|----------------|
| `src/app/[locale]/page.tsx` | Homepage |
| `src/app/[locale]/register/page.tsx` | Registration |
| `src/app/[locale]/verify-email/page.tsx` | Email verification |
| `src/app/[locale]/reset-password/page.tsx` | Password reset |
| `src/app/[locale]/account/page.tsx` | Account management |

## 📈 Refactoring Impact Summary

### Phase 1 Impact (Core UI Components)

- **Files Modified**: 15
- **Lines Removed**: ~400
- **Lines Added**: ~200
- **Net Reduction**: ~200 lines

### Phase 2 Impact (Utilities)

- **Files Modified**: 6
- **Lines Removed**: ~150
- **Lines Added**: ~50
- **Net Reduction**: ~100 lines

### Phase 3 Impact (Layouts)

- **Files Modified**: 8
- **Lines Removed**: ~300
- **Lines Added**: ~100
- **Net Reduction**: ~200 lines

### Total Project Impact

- **Total Files Modified**: 29
- **Total Lines Removed**: ~850
- **Total Lines Added**: ~350
- **Net Code Reduction**: ~500 lines
- **New Reusable Components**: 10

## 🔧 Migration Strategy

### Safe Replacement Process

1. **Create** new component with full test coverage
2. **Replace** one instance and verify functionality
3. **Run** existing tests to ensure no regression
4. **Commit** after each file is updated
5. **Deploy** incrementally with feature flags if needed

### Rollback Strategy

- Keep old code commented for 1 sprint
- Use feature flags for gradual rollout
- Maintain backwards compatibility during transition

## ⚠️ Risk Assessment

| Component         | Risk Level | Mitigation Strategy        |
| ----------------- | ---------- | -------------------------- |
| LoadingSpinner    | ✅ Low     | Visual component only      |
| GradientButton    | ⚠️ Medium  | Extensive testing needed   |
| AlertMessage      | ✅ Low     | Non-interactive component  |
| InputWithIcon     | ⚠️ Medium  | Form validation critical   |
| Locale Utilities  | 🔴 High    | Affects all server actions |
| Error Handlers    | 🔴 High    | Critical for UX            |
| Layout Components | ✅ Low     | Wrapper components only    |

## 🚀 Quick Start Commands

```bash
# Create component directories
mkdir -p src/components/ui
mkdir -p src/components/ui/__tests__
mkdir -p src/components/layouts
mkdir -p src/lib/utils/__tests__

# Start with the safest component
touch src/components/ui/loading-spinner.tsx
touch src/components/ui/__tests__/loading-spinner.test.tsx
```

---

**Note**: This analysis provides exact file locations and line numbers based on the current codebase state. Update these references if the codebase changes before implementation begins.
