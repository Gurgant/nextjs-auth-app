# Current Middleware Behavior Documentation

## Date: 2025-08-03

### Active Middleware

- **File**: `/middleware.ts` (root)
- **Purpose**: OAuth/Auth error handling
- **Key behavior**: Redirects auth errors to error page

### Inactive Middleware (likely ignored by Next.js)

- **File**: `/src/middleware.ts`
- **Purpose**: i18n routing with next-intl
- **Note**: Only one middleware can be active, root takes precedence

### Current Behavior

1. **Auth Error Handling**
   - Detects `error` query parameter
   - Checks if URL contains auth-related paths
   - Redirects to `/{locale}/auth/error?error={error}`
   - Uses UNSAFE locale extraction: `pathname.split('/')[1] || 'en'`

2. **Security Issues**
   - No validation of extracted locale
   - Accepts any string as locale
   - Vulnerable to path manipulation

3. **Routes Affected**
   - `/auth/signin`
   - `/auth/callback`
   - `/api/auth/*`

### Test URLs

```bash
# Valid auth error
/en/auth/signin?error=OAuthAccountNotLinked

# Invalid locale (currently accepted)
/xxx/auth/signin?error=test

# Potential security issue
/../../../etc/passwd/auth/signin?error=test
```

### Rollback Instructions

If issues arise after changes:

1. Copy backup files back:
   ```bash
   cp backups/middleware/20250803_125105/middleware.root.ts middleware.ts
   cp backups/middleware/20250803_125105/middleware.src.ts src/middleware.ts
   ```
2. Restart dev server
3. Test functionality

### Known Working Features

- OAuth error redirects work
- Default locale fallback to 'en'
- API routes not affected
- Static files served correctly
