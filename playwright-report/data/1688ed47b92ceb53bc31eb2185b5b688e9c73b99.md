# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - navigation [ref=e3]:
      - generic [ref=e5]:
        - link "Auth App" [ref=e6] [cursor=pointer]:
          - /url: /en
          - img [ref=e8] [cursor=pointer]
          - heading "Auth App" [level=1] [ref=e10] [cursor=pointer]
        - 'button "Current language: English. Click to change language." [ref=e13] [cursor=pointer]':
          - generic [ref=e14] [cursor=pointer]: EN
          - generic [ref=e15] [cursor=pointer]: English
          - img [ref=e16] [cursor=pointer]
    - main [ref=e18]:
      - generic [ref=e21]:
        - generic [ref=e22]:
          - img [ref=e24]
          - heading "Welcome back, Admin User!" [level=2] [ref=e26]
          - paragraph [ref=e27]: You're successfully signed in!
        - generic [ref=e28]:
          - link "Go to Dashboard" [ref=e29] [cursor=pointer]:
            - /url: /en/dashboard
            - img [ref=e30] [cursor=pointer]
            - text: Go to Dashboard
          - button "Sign out" [ref=e32]:
            - img [ref=e33]
            - text: Sign out
  - button "Open Next.js Dev Tools" [ref=e40] [cursor=pointer]:
    - img [ref=e41] [cursor=pointer]
  - alert [ref=e44]
```