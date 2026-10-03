/**
 * Role-Based Access Control (RBAC) — server-only guard.
 *
 * Imports the server auth() and next/server, so it must never be imported by a
 * Client Component; those use ./roles (re-exported here for server code).
 */

import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@/lib/types/prisma";
import { hasRole } from "./roles";

export * from "./roles";

/**
 * API route handler wrapper that requires specific role
 */
export function withRole<Args extends unknown[]>(
  requiredRole: Role,
  handler: (request: NextRequest, ...args: Args) => Promise<Response>,
) {
  return async (request: NextRequest, ...args: Args) => {
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
