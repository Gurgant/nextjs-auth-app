# Google OAuth Setup Guide

## Issue: Configuration Error

You're getting a "Configuration" error when trying to sign in with Google. Here's how to fix it:

## 1. Environment Variables ✅ Fixed

I've removed the quotes from your Google OAuth credentials in `.env.local`:

```bash
# Before (incorrect)
GOOGLE_CLIENT_ID="809010324332-..."
GOOGLE_CLIENT_SECRET="GOCSPX-..."

# After (correct)
GOOGLE_CLIENT_ID=809010324332-...
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

## 2. Google Cloud Console Setup

Make sure your Google OAuth is configured correctly:

### Required Steps:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new one
3. Go to **APIs & Services** > **Credentials**
4. Click on your OAuth 2.0 Client ID

### Check these settings:

- **Application type**: Web application
- **Authorized JavaScript origins**:
  - `http://localhost:3000`
- **Authorized redirect URIs**:
  - `http://localhost:3000/api/auth/callback/google`

## 3. OAuth Consent Screen

Go to **APIs & Services** > **OAuth consent screen** and ensure:

- Publishing status: Testing or Production
- Test users (if in Testing mode): Add your email
- Required scopes: email, profile

## 4. Restart Your Development Server

After fixing the environment variables:

```bash
# Stop the server (Ctrl+C)
# Start it again
pnpm run dev
```

## 5. Clear Browser Data

Sometimes cached OAuth data causes issues:

1. Clear cookies for localhost:3000
2. Clear browser cache
3. Try incognito/private browsing

## 6. Verify Configuration

The auth.ts file now includes validation that will log:

```
🔧 NextAuth Configuration Check:
  GOOGLE_CLIENT_ID: ✅ Set
  GOOGLE_CLIENT_SECRET: ✅ Set
  AUTH_SECRET: ✅ Set
```

## 7. Common Issues

### Issue: "Access blocked: This app's request is invalid"

- Check that redirect URI matches exactly: `http://localhost:3000/api/auth/callback/google`
- No trailing slashes
- Correct protocol (http for localhost)

### Issue: Still getting Configuration error

- Check server logs for the exact error
- Ensure database is running (PostgreSQL on port 5433)
- Verify DATABASE_URL is correct

### Issue: Redirect URI mismatch

- The URI in Google Console must match EXACTLY
- Check for typos, extra slashes, wrong ports

## Next Steps

1. Restart your dev server
2. Check the terminal for configuration logs
3. Try signing in with Google again
4. If it fails, check the terminal for specific error messages

The configuration should now work properly!
