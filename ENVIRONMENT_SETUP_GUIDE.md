# 🔐 ENVIRONMENT VARIABLES SETUP GUIDE

## ✅ Email Configuration (Already Done)
You've already added:
- `RESEND_API_KEY` - Your Resend API key
- `EMAIL_FROM` - Your sender email address

## 🔑 REQUIRED SECRETS FOR ENCRYPTION & 2FA

### 1. ENCRYPTION_KEY (For 2FA secrets encryption)
This key is used to encrypt sensitive data like 2FA secrets in the database.

**Generate your key (choose ONE):**

```bash
# Option 1: Base64 format (32 characters)
node -e "console.log(require('crypto').randomBytes(32).toString('base64').slice(0, 32))"

# Option 2: Hex format (32 characters)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

# Option 3: Use OpenSSL
openssl rand -base64 32 | head -c 32
```

**Example generated key:**
```
ENCRYPTION_KEY="WFezhc3Y4jcN4v5weVMAZOVh4oal4D20"
```

### 2. NEXTAUTH_SECRET (For session encryption)
This is critical for NextAuth.js to encrypt sessions and JWT tokens.

**Generate your secret:**

```bash
# Option 1: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Option 2: Using OpenSSL
openssl rand -base64 32

# Option 3: Using the NextAuth CLI (if installed)
npx auth secret
```

**Example generated secret:**
```
NEXTAUTH_SECRET="zIZdejX22PEyHVziWzvFZOrbIERk9AeCwkqeMVm8xGU="
```

### 3. Additional Security Variables (Optional but Recommended)

```bash
# JWT Secret (if using JWT separately)
JWT_SECRET="$(openssl rand -base64 32)"

# 2FA Issuer Name (for authenticator apps)
TWO_FACTOR_ISSUER="YourAppName"

# Session encryption (additional layer)
SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
```

## 📝 ADD TO YOUR .env AND .env.local FILES

Add these lines to both `.env` and `.env.local`:

```env
# Email Service (Resend) - ALREADY ADDED ✅
RESEND_API_KEY="your-actual-resend-api-key"
EMAIL_FROM="your-actual-email@domain.com"

# Encryption & Security - ADD THESE NOW 🔐
ENCRYPTION_KEY="[YOUR_GENERATED_32_CHAR_KEY]"
NEXTAUTH_SECRET="[YOUR_GENERATED_NEXTAUTH_SECRET]"

# Optional but recommended
TWO_FACTOR_ISSUER="NextJS Auth App"  # Or your app name
MAX_LOGIN_ATTEMPTS="5"
ACCOUNT_LOCKOUT_DURATION="15"
EMAIL_VERIFICATION_REQUIRED="true"
```

## ⚠️ IMPORTANT SECURITY NOTES

1. **NEVER commit these values to Git**
   - Make sure `.env` and `.env.local` are in `.gitignore`
   - Only commit `.env.example` with placeholder values

2. **Use different keys for different environments**
   - Development: One set of keys
   - Staging: Different keys
   - Production: Completely different, highly secure keys

3. **Store production secrets securely**
   - Use environment variables in your hosting platform (Vercel, AWS, etc.)
   - Consider using secret management services (AWS Secrets Manager, HashiCorp Vault)

4. **Rotate keys periodically**
   - Change encryption keys every 3-6 months
   - Update NextAuth secret if there's any security concern

## 🧪 TEST YOUR CONFIGURATION

After adding the environment variables, test them:

```bash
# 1. Check if environment variables are loaded
node -e "console.log('ENCRYPTION_KEY:', process.env.ENCRYPTION_KEY?.slice(0,5) + '...')"

# 2. Restart your development server
pnpm dev

# 3. Test 2FA functionality (if implemented)
# Try registering a new user and enabling 2FA
```

## 📋 QUICK SETUP COMMANDS

Run these commands to generate all keys at once:

```bash
echo "# Generated Secrets - Add to .env and .env.local" > generated_secrets.txt
echo "ENCRYPTION_KEY=\"$(node -e "console.log(require('crypto').randomBytes(32).toString('base64').slice(0, 32))")\"" >> generated_secrets.txt
echo "NEXTAUTH_SECRET=\"$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")\"" >> generated_secrets.txt
echo "JWT_SECRET=\"$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")\"" >> generated_secrets.txt
cat generated_secrets.txt
```

## ✅ VERIFICATION CHECKLIST

- [ ] Generated ENCRYPTION_KEY (32 characters)
- [ ] Generated NEXTAUTH_SECRET
- [ ] Added both to `.env` file
- [ ] Added both to `.env.local` file
- [ ] Verified `.env` and `.env.local` are in `.gitignore`
- [ ] Restarted development server
- [ ] Tested login functionality

---

**Note**: The keys shown in examples above are for demonstration only. Always generate your own unique keys!