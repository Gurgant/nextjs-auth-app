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
  - heading "Welcome back" [level=3]
  - paragraph: Choose your preferred sign-in method
  - button "Sign in with Google":
    - img
    - text: Sign in with Google
  - text: Or
  - button "Sign in with Email"
  - paragraph:
    - text: Don't have an account?
    - link "Register here":
      - /url: /en/register
  - paragraph: Secure authentication with industry-standard encryption
- alert
```