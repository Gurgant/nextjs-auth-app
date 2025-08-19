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
  - heading "Create Your Account" [level=1]
  - paragraph: Join us today and get started
  - text: Full Name
  - textbox "Full Name"
  - text: Email Address
  - textbox "Email Address"
  - text: Create Password
  - textbox "Create Password": StrongP@ssw0rd123!
  - button "Show password"
  - text: Confirm Password
  - textbox "Confirm Password"
  - button "Show password"
  - checkbox "I agree to the Terms of Service and Privacy Policy"
  - text: I agree to the Terms of Service and Privacy Policy
  - button "Create Account" [disabled]
  - paragraph:
    - text: Already have an account?
    - link "Sign in here":
      - /url: /en
- alert
```