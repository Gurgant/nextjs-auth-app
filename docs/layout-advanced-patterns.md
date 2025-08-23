# Advanced Layout Patterns

This document covers advanced patterns and techniques for using layout components effectively.

## Dynamic Layouts

### Layout Based on User Role

```tsx
// app/[locale]/admin/page.tsx
import { auth } from "@/lib/auth";
import {
  AuthGuard,
  DashboardLayout,
  FormPageLayout,
} from "@/components/layouts";
import { AdminDashboard } from "@/components/admin/dashboard";
import { AccessDenied } from "@/components/admin/access-denied";

export default async function AdminPage({ params }: Props) {
  const session = await auth();
  const { locale } = await params;
  const isAdmin = session?.user?.role === "admin";

  return (
    <AuthGuard locale={locale} requireAuth>
      {isAdmin ? (
        <DashboardLayout maxWidth="7xl" gradient>
          <AdminDashboard user={session.user!} />
        </DashboardLayout>
      ) : (
        <FormPageLayout>
          <AccessDenied />
        </FormPageLayout>
      )}
    </AuthGuard>
  );
}
```

### Conditional Layout Features

```tsx
// components/layouts/conditional-layout.tsx
import { DashboardLayout, GradientPageLayout } from "@/components/layouts";

interface ConditionalLayoutProps {
  children: React.ReactNode;
  useGradient?: boolean;
  isPremium?: boolean;
  maxWidth?: Parameters<typeof DashboardLayout>[0]["maxWidth"];
}

export function ConditionalLayout({
  children,
  useGradient,
  isPremium,
  maxWidth = "4xl",
}: ConditionalLayoutProps) {
  if (isPremium && useGradient) {
    return (
      <GradientPageLayout gradient="purple-pink">
        <div className="py-8">
          <div className={`max-w-${maxWidth} mx-auto px-4`}>
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-1 rounded-xl">
              <div className="bg-white rounded-lg p-8">{children}</div>
            </div>
          </div>
        </div>
      </GradientPageLayout>
    );
  }

  return (
    <DashboardLayout gradient={useGradient} maxWidth={maxWidth}>
      {children}
    </DashboardLayout>
  );
}
```

## Nested Layouts

### Multi-Level Authentication

```tsx
// app/[locale]/team/[teamId]/settings/page.tsx
import { AuthGuard } from "@/components/layouts";
import { TeamAuthGuard } from "@/components/team/team-auth-guard";
import { TeamSettingsLayout } from "@/components/team/team-settings-layout";

interface Props {
  params: Promise<{
    locale: string;
    teamId: string;
  }>;
}

export default async function TeamSettingsPage({ params }: Props) {
  const { locale, teamId } = await params;

  return (
    <AuthGuard locale={locale} requireAuth>
      <TeamAuthGuard teamId={teamId} requiredRole="admin">
        <TeamSettingsLayout teamId={teamId}>
          <TeamSettings teamId={teamId} locale={locale} />
        </TeamSettingsLayout>
      </TeamAuthGuard>
    </AuthGuard>
  );
}
```

### Layout Composition

```tsx
// components/layouts/workspace-layout.tsx
import { DashboardLayout } from "@/components/layouts";
import { WorkspaceSidebar } from "@/components/workspace/sidebar";
import { WorkspaceHeader } from "@/components/workspace/header";

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  workspaceId: string;
  showSidebar?: boolean;
}

export function WorkspaceLayout({
  children,
  workspaceId,
  showSidebar = true,
}: WorkspaceLayoutProps) {
  return (
    <DashboardLayout maxWidth="7xl">
      <WorkspaceHeader workspaceId={workspaceId} />
      <div className="flex gap-6 mt-6">
        {showSidebar && (
          <aside className="w-64 flex-shrink-0">
            <WorkspaceSidebar workspaceId={workspaceId} />
          </aside>
        )}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </DashboardLayout>
  );
}
```

## Custom Layout Hooks

### useLayoutConfig Hook

```tsx
// hooks/use-layout-config.ts
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

export function useLayoutConfig() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const isAuthPage =
    pathname.includes("/signin") || pathname.includes("/register");
  const isDashboard = pathname.includes("/dashboard");
  const isAdmin = session?.user?.role === "admin";

  return {
    gradient: isAuthPage ? "blue-purple" : "default",
    maxWidth: isDashboard ? "7xl" : "4xl",
    showNavbar: !isAuthPage,
    showFooter: !isDashboard,
    theme: isAdmin ? "admin" : "default",
  } as const;
}

// Usage in component
export function AdaptiveLayout({ children }: { children: React.ReactNode }) {
  const config = useLayoutConfig();

  return (
    <DashboardLayout
      gradient={config.gradient !== "default"}
      maxWidth={config.maxWidth}
    >
      {children}
    </DashboardLayout>
  );
}
```

## Responsive Layout Patterns

### Mobile-First Layout

```tsx
// components/layouts/responsive-layout.tsx
"use client";

import { useState, useEffect } from "react";
import { DashboardLayout, CenteredContentLayout } from "@/components/layouts";

export function ResponsiveLayout({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  if (isMobile) {
    return <div className="min-h-screen bg-gray-50 p-4">{children}</div>;
  }

  return <DashboardLayout maxWidth="7xl">{children}</DashboardLayout>;
}
```

### Adaptive Grid Layout

```tsx
// app/[locale]/gallery/page.tsx
import { AuthGuard, DashboardLayout } from "@/components/layouts";

export default async function GalleryPage({ params }: Props) {
  const { locale } = await params;

  return (
    <AuthGuard locale={locale} requireAuth>
      <DashboardLayout maxWidth="7xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {/* Gallery items */}
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
```

## Performance Patterns

### Layout with Suspense

```tsx
// app/[locale]/data-heavy/page.tsx
import { Suspense } from "react";
import {
  AuthGuard,
  DashboardLayout,
  LoadingLayout,
} from "@/components/layouts";
import { DataTable } from "@/components/data/table";

async function SlowDataComponent() {
  const data = await fetchLargeDataset();
  return <DataTable data={data} />;
}

export default async function DataHeavyPage({ params }: Props) {
  const { locale } = await params;

  return (
    <AuthGuard locale={locale} requireAuth>
      <DashboardLayout maxWidth="7xl">
        <h1 className="text-2xl font-bold mb-6">Data Analysis</h1>
        <Suspense
          fallback={
            <LoadingLayout
              message="Loading data..."
              fullScreen={false}
              className="min-h-[400px]"
            />
          }
        >
          <SlowDataComponent />
        </Suspense>
      </DashboardLayout>
    </AuthGuard>
  );
}
```

### Optimistic UI with Layouts

```tsx
// components/optimistic-form-layout.tsx
"use client";

import { useOptimistic } from "react";
import { FormPageLayout } from "@/components/layouts";

export function OptimisticFormLayout({
  children,
  onSubmit,
}: {
  children: React.ReactNode;
  onSubmit: () => Promise<void>;
}) {
  const [isSubmitting, setIsSubmitting] = useOptimistic(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    await onSubmit();
  };

  return (
    <FormPageLayout>
      <div className={isSubmitting ? "opacity-50 pointer-events-none" : ""}>
        {children}
      </div>
      {isSubmitting && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-lg p-4">Processing...</div>
        </div>
      )}
    </FormPageLayout>
  );
}
```

## Theme-Aware Layouts

### Dark Mode Support

```tsx
// components/layouts/theme-aware-layout.tsx
"use client";

import { useTheme } from "next-themes";
import { GradientPageLayout, DashboardLayout } from "@/components/layouts";

export function ThemeAwareLayout({
  children,
  variant = "dashboard",
}: {
  children: React.ReactNode;
  variant?: "dashboard" | "form";
}) {
  const { theme } = useTheme();

  if (variant === "form") {
    return (
      <GradientPageLayout
        gradient={theme === "dark" ? "purple-pink" : "blue-purple"}
        className={theme === "dark" ? "dark" : ""}
      >
        {children}
      </GradientPageLayout>
    );
  }

  return (
    <DashboardLayout
      className={theme === "dark" ? "bg-gray-900 text-white" : ""}
    >
      {children}
    </DashboardLayout>
  );
}
```

## Testing Patterns

### Layout Test Utilities

```tsx
// test/utils/layout-test-utils.tsx
import { render } from "@testing-library/react";
import { AuthGuard } from "@/components/layouts";

// Mock auth for testing
jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

export function renderWithAuth(
  component: React.ReactElement,
  options = { authenticated: true },
) {
  const { auth } = require("@/lib/auth");

  auth.mockResolvedValue(
    options.authenticated
      ? { user: { id: "1", email: "test@example.com" } }
      : null,
  );

  return render(component);
}

// Usage in tests
describe("ProtectedPage", () => {
  it("renders when authenticated", async () => {
    const { getByText } = renderWithAuth(
      <AuthGuard locale="en" requireAuth>
        <div>Protected Content</div>
      </AuthGuard>,
    );

    expect(getByText("Protected Content")).toBeInTheDocument();
  });
});
```

## Layout Debugging

### Layout Boundaries Visualizer

```tsx
// components/layouts/debug-layout.tsx
const DEBUG = process.env.NODE_ENV === "development";

export function DebugLayout({
  children,
  name,
}: {
  children: React.ReactNode;
  name: string;
}) {
  if (!DEBUG) return <>{children}</>;

  return (
    <div className="relative border-2 border-dashed border-red-500 p-2">
      <div className="absolute top-0 left-0 bg-red-500 text-white text-xs px-2 py-1">
        {name}
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}

// Usage
<DebugLayout name="AuthGuard">
  <DebugLayout name="FormPageLayout">
    <DebugLayout name="RegistrationForm">
      <RegistrationForm />
    </DebugLayout>
  </DebugLayout>
</DebugLayout>;
```

## Layout Analytics

### Track Layout Usage

```tsx
// components/layouts/analytics-layout.tsx
"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

export function AnalyticsLayout({
  children,
  layoutName,
  variant,
}: {
  children: React.ReactNode;
  layoutName: string;
  variant?: string;
}) {
  useEffect(() => {
    trackEvent("layout_viewed", {
      layout: layoutName,
      variant,
      timestamp: new Date().toISOString(),
    });
  }, [layoutName, variant]);

  return <>{children}</>;
}

// Wrap existing layouts
export function TrackedFormPageLayout(props: FormPageLayoutProps) {
  return (
    <AnalyticsLayout layoutName="FormPageLayout" variant={props.gradient}>
      <FormPageLayout {...props} />
    </AnalyticsLayout>
  );
}
```

## Summary

These advanced patterns demonstrate:

- Dynamic layout selection based on conditions
- Nested and composed layouts
- Performance optimization techniques
- Theme and responsive considerations
- Testing and debugging strategies

Remember to:

- Keep layouts focused on structure, not business logic
- Use composition for complex requirements
- Consider performance implications
- Test layout behavior across different scenarios
- Document custom patterns for team members
