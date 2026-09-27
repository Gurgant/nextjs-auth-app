# Google OAuth Setup (optional)

Google sign-in is **optional**. Without both `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` the Google provider is not registered, the Google
button is not shown and the home page offers the e-mail form directly. To
enable it you need OAuth credentials from Google Cloud.

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
- **Every page errors and the log mentions `GOOGLE_CLIENT_ID /
GOOGLE_CLIENT_SECRET`** — only one of the two variables is set; set both or
  neither.
- **No Google button** — the provider is registered only when both variables
  are non-empty; restart the server after editing `.env`.
- **Consent screen in Testing mode** — only listed test users can sign in;
  either add your account or publish the consent screen.

Accounts created via Google can later add a password (account linking) from
the account page. Note that Google sign-ins are **not** asked for a TOTP code,
even when the user has enabled 2FA — see `SECURITY.md`.
