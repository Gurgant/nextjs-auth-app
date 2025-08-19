# Input Patterns Analysis

## 🔍 Discovered Patterns

### 1. Email Input Pattern
**Found in:** credentials-form.tsx, registration-form.tsx

```tsx
<div className="relative">
  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
    </svg>
  </div>
  <input
    id="email"
    type="email"
    className="block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[color]-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
    placeholder={t('emailPlaceholder')}
  />
</div>
```

### 2. Password Input Pattern
**Found in:** credentials-form.tsx, registration-form.tsx

```tsx
<div className="relative">
  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  </div>
  <input
    id="password"
    type="password"
    className="block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[color]-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
    placeholder={t('passwordPlaceholder')}
  />
</div>
```

### 3. User/Name Input Pattern
**Found in:** registration-form.tsx

```tsx
<div className="relative">
  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  </div>
  <input
    id="name"
    type="text"
    className="block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
    placeholder={t('namePlaceholder')}
  />
</div>
```

### 4. Verification Code Pattern (Special Case)
**Found in:** two-factor-verification.tsx, two-factor-setup.tsx

```tsx
<input
  type="text"
  value={verificationCode}
  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
  placeholder="123456"
  className="block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-center text-2xl font-mono tracking-widest"
  maxLength={6}
/>
```

## 📊 Pattern Summary

### Common Elements
1. **Container**: `<div className="relative">`
2. **Icon Container**: `<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">`
3. **SVG Icon**: `<svg className="h-5 w-5 text-gray-400">`
4. **Input**: Consistent styling with `pl-10` for icon space

### Variations
1. **Focus Ring Colors**: 
   - Blue (credentials-form)
   - Green (registration-form)
   - Different colors for different contexts

2. **Error States**: 
   - Some inputs have error messages below
   - Pattern: `{result?.errors?.fieldName && <p className="mt-1 text-sm text-red-600">{result.errors.fieldName}</p>}`

3. **Special Inputs**:
   - Verification codes have different styling (centered, monospace)
   - No icons for verification codes

## 🎯 Component Requirements

Based on analysis, the InputWithIcon component needs:

1. **Icon Support**:
   - mail (email icon)
   - lock (password icon)
   - user (person icon)
   - key (for 2FA fields)
   - shield (for security fields)

2. **Input Types**:
   - email
   - password
   - text
   - number (for verification codes)

3. **States**:
   - Normal
   - Focused (with customizable ring color)
   - Error (red border + error message)
   - Disabled

4. **Features**:
   - Password visibility toggle (Eye/EyeOff icons)
   - Error message display
   - Custom placeholder
   - Custom className support

5. **Accessibility**:
   - Proper label association
   - ARIA attributes for errors
   - Keyboard navigation support

## 📈 Estimated Impact

### Files to Update
1. **credentials-form.tsx**: 2 inputs (email, password)
2. **registration-form.tsx**: 4 inputs (name, email, password, confirm password)
3. **account-management.tsx**: Multiple inputs across sections
4. **two-factor-setup.tsx**: Verification code input
5. **two-factor-verification.tsx**: Code inputs

### Total Instances
- **Email inputs**: ~6 instances
- **Password inputs**: ~8 instances
- **Name/User inputs**: ~3 instances
- **Verification inputs**: ~3 instances
- **Total**: ~20 input instances

### Lines to Save
- Current pattern: ~15 lines per input
- New pattern: ~5 lines per input
- **Estimated savings**: ~200 lines