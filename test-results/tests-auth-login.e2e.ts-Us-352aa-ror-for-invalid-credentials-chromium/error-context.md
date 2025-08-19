# Page snapshot

```yaml
- navigation:
  - link "Auth App":
    - /url: /en
    - img
    - heading "Auth App" [level=1]
  - 'button "Current language: English. Click to change language."':
    - text: EN English
    - img
- main:
  - img
  - heading "Welcome to Our App" [level=1]
  - paragraph: Simple authentication with Google OAuth
  - heading "Sign in to your account" [level=3]
  - paragraph: Enter your credentials to continue
  - text: Email Address
  - textbox "Email Address": test@example.com
  - text: Password
  - textbox "Password": WrongPassword123!
  - button "Show password"
  - button "Loading... Signing in..." [disabled]:
    - status "Loading..."
    - text: Signing in...
  - text: Or
  - button "Sign in with Google instead"
  - paragraph:
    - text: Don't have an account?
    - link "Register here":
      - /url: /en/register
  - paragraph: Secure authentication with industry-standard encryption
- alert
```