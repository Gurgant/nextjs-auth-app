import { cn } from "@/lib/utils";
import { GradientPageLayout } from "./gradient-page-layout";

interface DashboardLayoutProps {
  children: React.ReactNode;
  maxWidth?: "lg" | "xl" | "2xl" | "4xl" | "7xl";
  className?: string;
  gradient?: boolean;
}

const maxWidthClasses = {
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "4xl": "max-w-4xl",
  "7xl": "max-w-7xl",
} as const;

/**
 * Layout component for dashboard/protected pages
 * Provides consistent container width and optional gradient background
 *
 * @example
 * // Basic dashboard layout
 * <DashboardLayout>
 *   <DashboardContent />
 * </DashboardLayout>
 *
 * @example
 * // With gradient and custom width
 * <DashboardLayout gradient maxWidth="7xl">
 *   <AccountManagement />
 * </DashboardLayout>
 */
export function DashboardLayout({
  children,
  maxWidth = "4xl",
  className,
  gradient = false,
}: DashboardLayoutProps) {
  const content = (
    <div className={cn("py-8", className)}>
      <div className={cn(maxWidthClasses[maxWidth], "mx-auto px-4")}>
        {children}
      </div>
    </div>
  );

  if (gradient) {
    return <GradientPageLayout>{content}</GradientPageLayout>;
  }

  return <div className="min-h-[calc(100vh-4rem)]">{content}</div>;
}
