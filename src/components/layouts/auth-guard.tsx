import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

interface AuthGuardProps {
  children: React.ReactNode;
  locale: string;
  requireAuth?: boolean;
  redirectTo?: string;
}

/**
 * Server component that handles authentication-based routing
 *
 * @example
 * // Protect a route (redirect to home if not authenticated)
 * <AuthGuard locale={locale} requireAuth>
 *   <ProtectedContent />
 * </AuthGuard>
 *
 * @example
 * // Public route (redirect to dashboard if authenticated)
 * <AuthGuard locale={locale} requireAuth={false} redirectTo="/dashboard">
 *   <PublicContent />
 * </AuthGuard>
 */
export async function AuthGuard({
  children,
  locale,
  requireAuth = true,
  redirectTo,
}: AuthGuardProps) {
  const session = await auth();
  const isAuthenticated = !!session?.user;

  // Handle protected routes
  if (requireAuth && !isAuthenticated) {
    const defaultRedirect = `/${locale}`;
    redirect(redirectTo || defaultRedirect);
  }

  // Handle public routes (redirect authenticated users)
  if (!requireAuth && isAuthenticated) {
    const defaultRedirect = `/${locale}/dashboard`;
    redirect(redirectTo || defaultRedirect);
  }

  return <>{children}</>;
}
