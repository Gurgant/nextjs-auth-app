/**
 * Role-Based Access Control (RBAC) utilities
 */

import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { Role } from "@/lib/types/prisma";

/**
 * Role hierarchy - higher roles have access to lower role features
 */
const ROLE_HIERARCHY: Record<Role, number> = {
  USER: 1,
  PRO_USER: 2,
  ADMIN: 3,
};

/**
 * Check if user has required role
 */
export function hasRole(
  userRole: Role | undefined,
  requiredRole: Role,
): boolean {
  if (!userRole) return false;

  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;

  return userLevel >= requiredLevel;
}

/**
 * Check if user has exact role (no hierarchy)
 */
export function hasExactRole(
  userRole: Role | undefined,
  targetRole: Role,
): boolean {
  return userRole === targetRole;
}

/**
 * Check if user is admin
 */
export function isAdmin(userRole: Role | undefined): boolean {
  return userRole === "ADMIN";
}

/**
 * Check if user is pro user or admin
 */
export function isProUser(userRole: Role | undefined): boolean {
  return hasRole(userRole, "PRO_USER");
}

/**
 * Middleware to require specific role for route access
 */
export function requireRole(requiredRole: Role) {
  return async (request: NextRequest) => {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.redirect(new URL("/auth/signin", request.url));
    }

    const userRole = session.user.role as Role | undefined;

    if (!hasRole(userRole, requiredRole)) {
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }

    return NextResponse.next();
  };
}

/**
 * API route handler wrapper that requires specific role
 */
export function withRole(
  requiredRole: Role,
  handler: (request: NextRequest, ...args: any[]) => Promise<Response>,
) {
  return async (request: NextRequest, ...args: any[]) => {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const userRole = session.user.role as Role | undefined;

    if (!hasRole(userRole, requiredRole)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    return handler(request, ...args);
  };
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role: Role): string {
  const displayNames: Record<Role, string> = {
    USER: "User",
    PRO_USER: "Pro User",
    ADMIN: "Administrator",
  };

  return displayNames[role] || "Unknown";
}

/**
 * Get role badge color for UI
 */
export function getRoleBadgeColor(role: Role): string {
  const colors: Record<Role, string> = {
    USER: "bg-gray-100 text-gray-800",
    PRO_USER: "bg-blue-100 text-blue-800",
    ADMIN: "bg-red-100 text-red-800",
  };

  return colors[role] || "bg-gray-100 text-gray-800";
}

/**
 * Get available features for role
 */
export function getRoleFeatures(role: Role): string[] {
  const features: Record<Role, string[]> = {
    USER: ["Basic dashboard", "Profile management", "Email notifications"],
    PRO_USER: [
      "Basic dashboard",
      "Profile management",
      "Email notifications",
      "Advanced analytics",
      "Priority support",
      "Export data",
      "Custom themes",
    ],
    ADMIN: [
      "All Pro User features",
      "User management",
      "System settings",
      "Security logs",
      "Database management",
      "Role assignments",
    ],
  };

  return features[role] || [];
}

/**
 * Get default dashboard path for user role
 */
export function getRoleDashboardPath(
  role: Role,
  locale: string = "en",
): string {
  const dashboardPaths: Record<Role, string> = {
    USER: `/${locale}/dashboard/user`,
    PRO_USER: `/${locale}/dashboard/pro`,
    ADMIN: `/${locale}/admin`,
  };

  return dashboardPaths[role] || `/${locale}/dashboard/user`;
}
