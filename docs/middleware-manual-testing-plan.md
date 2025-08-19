# Middleware Manual Testing Plan

## Testing Environment Setup

1. **Backup Current Middleware**
   ```bash
   cp middleware.ts middleware.backup.ts
   ```

2. **Deploy New Middleware**
   ```bash
   cp middleware.new.ts middleware.ts
   ```

3. **Start Development Server**
   ```bash
   pnpm run dev
   ```

## Test Scenarios

### 1. Locale Routing Tests

#### Test 1.1: Root Path Redirect
- **Navigate to**: `http://localhost:3000/`
- **Expected**: Redirects to `http://localhost:3000/en`
- **Verify**: 
  - Redirect happens automatically
  - `locale` cookie is set to `en`

#### Test 1.2: Path Without Locale
- **Navigate to**: `http://localhost:3000/dashboard`
- **Expected**: Redirects to `http://localhost:3000/en/dashboard`
- **Verify**: 
  - Locale is added to path
  - Original path is preserved

#### Test 1.3: Valid Locale Paths
- **Test URLs**:
  - `http://localhost:3000/en/dashboard` → No redirect
  - `http://localhost:3000/es/dashboard` → No redirect
  - `http://localhost:3000/fr/dashboard` → No redirect
  - `http://localhost:3000/it/dashboard` → No redirect
  - `http://localhost:3000/de/dashboard` → No redirect
- **Verify**: Pages load without redirect

#### Test 1.4: Invalid Locale Paths
- **Navigate to**: `http://localhost:3000/xx/dashboard`
- **Expected**: Redirects to `http://localhost:3000/en/xx/dashboard`
- **Verify**: 
  - Invalid locale treated as path segment
  - Default locale prepended

### 2. Cookie-Based Locale Tests

#### Test 2.1: Cookie Locale Preference
1. **Set cookie**: Use browser DevTools to set `locale=es`
2. **Navigate to**: `http://localhost:3000/dashboard`
3. **Expected**: Redirects to `http://localhost:3000/es/dashboard`
4. **Verify**: Cookie locale is respected

#### Test 2.2: Invalid Cookie Locale
1. **Set cookie**: `locale=invalid`
2. **Navigate to**: `http://localhost:3000/dashboard`
3. **Expected**: Redirects to `http://localhost:3000/en/dashboard`
4. **Verify**: Falls back to default locale

### 3. Accept-Language Header Tests

#### Test 3.1: Browser Language Preference
1. **Change browser language** to Spanish
2. **Clear cookies**
3. **Navigate to**: `http://localhost:3000/`
4. **Expected**: Redirects to `http://localhost:3000/es`
5. **Verify**: Browser language detected

### 4. Auth Error Redirect Tests

#### Test 4.1: OAuth Error Redirect
- **Navigate to**: `http://localhost:3000/en/auth/signin?error=OAuthAccountNotLinked`
- **Expected**: Redirects to `http://localhost:3000/en/auth/error?error=OAuthAccountNotLinked`
- **Verify**: 
  - Error parameter preserved
  - Locale maintained

#### Test 4.2: Different Locale Auth Error
- **Navigate to**: `http://localhost:3000/es/auth/callback?error=AccessDenied`
- **Expected**: Redirects to `http://localhost:3000/es/auth/error?error=AccessDenied`
- **Verify**: Spanish locale preserved

### 5. Security Tests

#### Test 5.1: Path Traversal Attack
- **Navigate to**: `http://localhost:3000/../../../etc/passwd`
- **Expected**: Redirects to `http://localhost:3000/en/%2F..%2F..%2F..%2Fetc%2Fpasswd`
- **Verify**: Path safely encoded

#### Test 5.2: XSS in Locale
- **Navigate to**: `http://localhost:3000/<script>alert("xss")</script>/dashboard`
- **Expected**: Redirects to safe path with default locale
- **Verify**: No script execution

#### Test 5.3: SQL Injection Attempt
- **Navigate to**: `http://localhost:3000/"; DROP TABLE users; --/page`
- **Expected**: Redirects to safe path
- **Verify**: No database errors

### 6. Static Asset Tests

#### Test 6.1: Static Files Not Redirected
- **Test URLs**:
  - `http://localhost:3000/_next/static/chunk.js`
  - `http://localhost:3000/favicon.ico`
  - `http://localhost:3000/images/logo.png`
- **Verify**: No redirects, files load directly

### 7. API Route Tests

#### Test 7.1: API Routes Exempt
- **Test URLs**:
  - `http://localhost:3000/api/auth/session`
  - `http://localhost:3000/api/health`
- **Verify**: No locale routing applied

### 8. Performance Tests

#### Test 8.1: Response Time
1. Open Network tab in DevTools
2. Navigate to various pages
3. **Verify**: Middleware adds < 5ms to response time

#### Test 8.2: Multiple Redirects
1. Clear cookies
2. Navigate to: `http://localhost:3000/dashboard?tab=settings`
3. **Verify**: 
   - Only one redirect occurs
   - Query parameters preserved

### 9. Security Header Tests

#### Test 9.1: Check Response Headers
1. Open Network tab
2. Navigate to any page
3. **Verify headers present**:
   - `X-Locale`: Current locale
   - `X-Content-Type-Options`: nosniff
   - `X-Frame-Options`: DENY
   - `X-XSS-Protection`: 1; mode=block

### 10. Console Logging Tests

#### Test 10.1: Security Event Logging
1. Open browser console
2. Navigate to: `http://localhost:3000/xx/invalid`
3. **Verify**: Security warning logged (in development)

#### Test 10.2: Auth Error Logging
1. Navigate to auth error URL
2. **Verify**: Auth error redirect logged

## Testing Checklist

- [ ] All locale routing tests pass
- [ ] Cookie preferences work correctly
- [ ] Accept-Language fallback works
- [ ] Auth errors redirect properly
- [ ] Security attacks handled safely
- [ ] Static assets not affected
- [ ] API routes work normally
- [ ] Performance acceptable
- [ ] Security headers present
- [ ] Logging works as expected

## Rollback Procedure

If any tests fail:

```bash
# Restore original middleware
cp middleware.backup.ts middleware.ts

# Remove backup
rm middleware.backup.ts

# Restart server
pnpm run dev
```

## Sign-off

- [ ] All tests completed successfully
- [ ] No console errors observed
- [ ] Performance metrics acceptable
- [ ] Ready for deployment