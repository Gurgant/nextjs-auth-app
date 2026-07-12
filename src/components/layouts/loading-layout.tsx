import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";

interface LoadingLayoutProps {
  message?: string;
  fullScreen?: boolean;
  spinnerSize?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

/**
 * Layout component for loading states
 * Provides consistent loading UI across the application
 *
 * @example
 * // Basic loading
 * <LoadingLayout />
 *
 * @example
 * // With custom message
 * <LoadingLayout message="Processing your request..." spinnerSize="xl" />
 *
 * @example
 * // Full screen loading
 * <LoadingLayout fullScreen message="Loading application..." />
 */
export function LoadingLayout({
  message = "Loading...",
  fullScreen = false,
  spinnerSize = "lg",
  className,
}: LoadingLayoutProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center",
        fullScreen ? "min-h-screen" : "min-h-[calc(100vh-4rem)]",
        "bg-gray-50",
        className,
      )}
    >
      <div className="text-center">
        <LoadingSpinner size={spinnerSize} color="primary" />
        {message && <p className="mt-2 text-gray-600">{message}</p>}
      </div>
    </div>
  );
}
