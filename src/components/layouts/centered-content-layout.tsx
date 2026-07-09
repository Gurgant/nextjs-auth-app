import { cn } from "@/lib/utils";

interface CenteredContentLayoutProps {
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "4xl" | "7xl";
  className?: string;
  fullHeight?: boolean;
}

const maxWidthClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "4xl": "max-w-4xl",
  "7xl": "max-w-7xl",
} as const;

/**
 * Layout component that centers content with optional max-width constraint
 *
 * @example
 * // Form layout
 * <CenteredContentLayout maxWidth="md">
 *   <LoginForm />
 * </CenteredContentLayout>
 *
 * @example
 * // Full height centering
 * <CenteredContentLayout fullHeight>
 *   <LoadingSpinner />
 * </CenteredContentLayout>
 */
export function CenteredContentLayout({
  children,
  maxWidth = "md",
  className,
  fullHeight = true,
}: CenteredContentLayoutProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center px-4 py-8",
        fullHeight && "min-h-[calc(100vh-4rem)]",
        className,
      )}
    >
      <div className={cn("w-full", maxWidthClasses[maxWidth])}>{children}</div>
    </div>
  );
}
