import { cn } from "@/lib/utils";

interface GradientPageLayoutProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Layout component that provides a gradient background
 * Automatically handles min-height calculation for navbar
 *
 * @example
 * <GradientPageLayout>
 *   <YourContent />
 * </GradientPageLayout>
 *
 * @example
 * // With extra classes
 * <GradientPageLayout className="py-12">
 *   <YourContent />
 * </GradientPageLayout>
 */
export function GradientPageLayout({
  children,
  className,
}: GradientPageLayoutProps) {
  return (
    <div
      className={cn(
        "min-h-[calc(100vh-4rem)] bg-gradient-to-br",
        "from-blue-50 via-white to-purple-50",
        className,
      )}
    >
      {children}
    </div>
  );
}
