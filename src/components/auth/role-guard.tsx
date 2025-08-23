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

interface RoleGuardProps {
  children: ReactNode;
  requiredRole: Role;
  fallback?: ReactNode;
  redirectTo?: string;
  showLoading?: boolean;
}

export function RoleGuard({
  children,
  requiredRole,
  fallback = null,
  redirectTo,
  showLoading = true,
}: RoleGuardProps) {
  const { hasRole, isLoading, isAuthenticated } = useRole();
  const router = useRouter();

  const hasAccess = hasRole(requiredRole);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && redirectTo) {
      router.push(redirectTo as any);
    } else if (!isLoading && isAuthenticated && !hasAccess && redirectTo) {
      router.push(redirectTo as any);
    }
  }, [isLoading, isAuthenticated, hasAccess, redirectTo, router]);

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
