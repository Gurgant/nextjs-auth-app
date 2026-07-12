# Google OAuth Setup (optional)

Google sign-in is **optional** — the app runs fine with credentials-only
authentication. To enable it you need OAuth credentials from Google Cloud.

## 1. Create OAuth credentials

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and
   select (or create) a project.
2. Go to **APIs & Services → OAuth consent screen** and configure it
   (External, app name, support email). For local development you can leave it
   in _Testing_ mode and add your own Google account as a test user.
3. Go to **APIs & Services → Credentials → Create credentials →
   OAuth client ID**, type **Web application**.
4. Add the redirect URI for local development:

   ```
   http://localhost:3000/api/auth/callback/google
   ```

   For production, add the same path on your real origin (HTTPS).

## 2. Configure the environment

Uncomment and fill both variables in `.env` — set **both or neither**:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

Do not wrap the values in extra quotes and restart `pnpm dev` afterwards.

## Troubleshooting

- **`redirect_uri_mismatch`** — the redirect URI in Google Cloud must match
  `<origin>/api/auth/callback/google` exactly (scheme, host, port).
- **`Configuration` error page** — one of the two variables is missing or
  empty; the app requires both to enable the provider.
- **Consent screen in Testing mode** — only listed test users can sign in;
  either add your account or publish the consent screen.

Accounts created via Google can later add a password (account linking) from
the account page.
