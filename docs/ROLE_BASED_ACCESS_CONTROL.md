# Role-Based Access Control (RBAC) Implementation Guide

## Current Status

As of now, the application **does not have role-based access control implemented**. Any authenticated user has access to all authenticated routes. Role references in test files are mocked for future implementation.

## Problem Resolution Summary

### Issue

TypeScript compilation errors in `src/test/setup/database.setup.ts` due to non-existent 'role' field on User model.

### Root Cause

- Test setup attempted to set `role: 'user'` and `role: 'admin'` on User creation
- Prisma schema User model doesn't include a 'role' field
- Role-based access was planned but never implemented

### Solution Applied

1. Removed role field assignments from test setup
2. Added TODO comments documenting future implementation
3. Maintained mock role in JWT tokens for testing purposes only

## Future Implementation Plan

### Step 1: Update Prisma Schema

```prisma
model User {
  // ... existing fields ...
  role      Role     @default(USER)
  // ... rest of model ...
}

enum Role {
  USER
  ADMIN
  MODERATOR
}
```

### Step 2: Generate Prisma Client & Migrate

```bash
pnpm prisma migrate dev --name add-user-roles
pnpm prisma generate
```

### Step 3: Update Authentication Configuration

```typescript
// src/lib/auth-config.ts
callbacks: {
  jwt: async ({ token, user }) => {
    if (user) {
      token.role = user.role
    }
    return token
  },
  session: async ({ session, token }) => {
    if (session.user && token.role) {
      session.user.role = token.role
    }
    return session
  }
}
```

### Step 4: Create Role Checking Middleware

```typescript
// src/lib/middleware/rbac.ts
export function requireRole(allowedRoles: Role[]) {
  return async (req: NextRequest) => {
    const session = await auth();

    if (!session?.user?.role) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (!allowedRoles.includes(session.user.role)) {
      return new Response("Forbidden", { status: 403 });
    }

    return NextResponse.next();
  };
}
```

### Step 5: Protect Routes

```typescript
// src/app/api/admin/metrics/route.ts
export async function GET(request: NextRequest) {
  const session = await auth();

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });

  if (user?.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Admin privileges required" },
      { status: 403 },
    );
  }

  // ... rest of endpoint logic
}
```

## Best Practices

### 1. **Type Safety**

- Always ensure Prisma schema changes are reflected in TypeScript types
- Run `pnpm prisma generate` after schema changes
- Use enum for roles instead of strings

### 2. **Security**

- Never trust client-side role checks alone
- Always verify roles server-side
- Use principle of least privilege
- Log role-based access attempts for auditing

### 3. **Testing**

- Create separate test utilities for different role scenarios
- Mock roles in test environment when RBAC not implemented
- Test both authorized and unauthorized access paths

### 4. **Migration Strategy**

- Assign default roles to existing users during migration
- Consider granular permissions instead of rigid roles for complex applications
- Document role capabilities clearly

### 5. **Development Workflow**

- Keep test setup in sync with production schema
- Use feature flags to gradually roll out RBAC
- Maintain backward compatibility during transition

## Code Organization

```
src/
├── lib/
│   ├── auth/
│   │   ├── rbac.ts           # Role-based access control utilities
│   │   └── permissions.ts     # Permission definitions
│   ├── middleware/
│   │   └── auth-middleware.ts # Authentication & authorization middleware
│   └── types/
│       └── auth.types.ts      # Role and permission types
├── test/
│   └── utils/
│       └── test-roles.ts      # Test utilities for role scenarios
```

## Testing Considerations

### Unit Tests

```typescript
describe("Role-based access", () => {
  it("should allow admin to access admin routes", async () => {
    const user = createMockUser({ role: "ADMIN" });
    // ... test logic
  });

  it("should deny regular user admin access", async () => {
    const user = createMockUser({ role: "USER" });
    // ... test logic
  });
});
```

### Integration Tests

```typescript
describe("Admin API endpoints", () => {
  it("should return 403 for non-admin users", async () => {
    const response = await fetch("/api/admin/metrics", {
      headers: createAuthHeaders({ role: "USER" }),
    });
    expect(response.status).toBe(403);
  });
});
```

## Common Pitfalls to Avoid

1. **Don't hardcode roles** - Use configuration or database
2. **Don't mix authentication with authorization** - Keep concerns separate
3. **Don't forget to update tests** when adding role checks
4. **Don't expose sensitive role information** in client-side code
5. **Don't implement without proper planning** - Consider all use cases

## References

- [Next.js Authentication](https://nextjs.org/docs/authentication)
- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
- [NextAuth.js Callbacks](https://next-auth.js.org/configuration/callbacks)
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

## Monitoring & Maintenance

Once implemented, monitor:

- Failed authorization attempts
- Role assignment changes
- Performance impact of role checks
- User feedback on access restrictions

Regular maintenance tasks:

- Review and audit role assignments
- Update role permissions as needed
- Remove unused roles
- Document role changes

---

_Last Updated: 2025-08-19_
_Status: Planned Feature - Not Yet Implemented_
