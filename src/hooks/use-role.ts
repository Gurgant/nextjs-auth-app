/**
 * React hook for role-based access control
 */

"use client";

import { useSession } from "next-auth/react";
import { Role } from "@/lib/types/prisma";
import { hasRole, hasExactRole, isAdmin, isProUser } from "@/lib/auth/rbac";

export function useRole() {
  const { data: session, status } = useSession();
  
  const userRole = session?.user?.role as Role | undefined;
  
  return {
    // Current user role
    role: userRole,
    
    // Loading state
    isLoading: status === "loading",
    
    // Check if user has required role (with hierarchy)
    hasRole: (requiredRole: Role) => hasRole(userRole, requiredRole),
    
    // Check if user has exact role (no hierarchy)
    hasExactRole: (targetRole: Role) => hasExactRole(userRole, targetRole),
    
    // Quick checks
    isAdmin: () => isAdmin(userRole),
    isProUser: () => isProUser(userRole),
    isUser: () => userRole === "USER",
    
    // Check if user is authenticated
    isAuthenticated: !!session?.user,
  };
}