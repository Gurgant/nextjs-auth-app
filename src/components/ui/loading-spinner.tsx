import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  /**
   * Size of the spinner
   * @default 'md'
   */
  size?: "sm" | "md" | "lg" | "xl";

  /**
   * Color variant of the spinner
   * @default 'primary'
   */
  color?: "white" | "primary" | "secondary" | "gray";

  /**
   * Additional CSS classes
   */
  className?: string;

  /**
   * Accessible label for screen readers
   * @default 'Loading...'
   */
  label?: string;
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
  xl: "h-8 w-8",
} as const;

const colorClasses = {
  white: "text-white",
  primary: "text-blue-600",
  secondary: "text-purple-600",
  gray: "text-gray-600",
} as const;

/**
 * A reusable loading spinner component with multiple size and color variants
 *
 * @example
 * // Default medium spinner
 * <LoadingSpinner />
 *
 * @example
 * // Small white spinner with custom margin
 * <LoadingSpinner size="sm" color="white" className="-ml-1 mr-3" />
 *
 * @example
 * // Large primary spinner with custom label
 * <LoadingSpinner size="lg" color="primary" label="Processing payment..." />
 */
export function LoadingSpinner({
  size = "md",
  color = "primary",
  className,
  label = "Loading...",
}: LoadingSpinnerProps) {
  return (
    <svg
      className={cn(
        "animate-spin",
        sizeClasses[size],
        colorClasses[color],
        className,
      )}
      fill="none"
      viewBox="0 0 24 24"
      aria-label={label}
      role="status"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
