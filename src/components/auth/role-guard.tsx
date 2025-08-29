/**
 * Role-based access control guard component
 */

"use client";

import { ReactNode } from "react";
import { useRole } from "@/hooks/use-role";
import { Role } from "@/lib/types/prisma";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { SafeNavigation } from "@/types/routes";

interface RoleGuardProps {
  children: ReactNode;
  requiredRole: Role;
  fallback?: ReactNode;
  redirectTo?: string; // Keep as string for backward compatibility, validate internally
  showLoading?: boolean;
}

export function RoleGuard({
  children,
  requiredRole,
  fallback = null,
  redirectTo,
  showLoading = true,
}: RoleGuardProps) {
  const { hasRole, isLoading, isAuthenticated, role } = useRole();
  const router = useRouter();

  const hasAccess = hasRole(requiredRole);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      // User is not authenticated - redirect to login or specified route
      if (redirectTo) {
        SafeNavigation.push(router, redirectTo, "/auth/signin");
      } else {
        SafeNavigation.push(router, "/auth/signin");
      }
    } else if (!hasAccess) {
      // User is authenticated but lacks required role
      if (redirectTo) {
        SafeNavigation.push(router, redirectTo, "/dashboard");
      } else {
        // Redirect to appropriate dashboard based on their role
        const dashboardRedirect = SafeNavigation.getDashboardRedirect(
          role || "USER",
        );
        SafeNavigation.push(router, dashboardRedirect);
      }
    }
  }, [isLoading, isAuthenticated, hasAccess, redirectTo, router, role]);

  if (isLoading) {
    return showLoading ? <LoadingSpinner /> : null;
  }

  if (!isAuthenticated) {
    return <>{fallback}</>;
  }

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Role-based visibility component
 * Shows/hides content based on user role without redirecting
 */
interface RoleVisibilityProps {
  children: ReactNode;
  role: Role | Role[];
  exact?: boolean;
  fallback?: ReactNode;
}

export function RoleVisibility({
  children,
  role,
  exact = false,
  fallback = null,
}: RoleVisibilityProps) {
  const { hasRole, hasExactRole, isLoading } = useRole();

  if (isLoading) {
    return null;
  }

  const roles = Array.isArray(role) ? role : [role];

  const hasAccess = exact
    ? roles.some((r) => hasExactRole(r))
    : roles.some((r) => hasRole(r));

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}
