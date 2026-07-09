import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from "./loading-spinner";

interface GradientButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Color variant of the button
   * @default 'blue-purple'
   */
  variant?:
    | "blue-purple"
    | "green-emerald"
    | "yellow-orange"
    | "red"
    | "blue"
    | "green";

  /**
   * Size of the button
   * @default 'md'
   */
  size?: "sm" | "md" | "lg";

  /**
   * Makes button full width
   * @default false
   */
  fullWidth?: boolean;

  /**
   * Loading state
   * @default false
   */
  loading?: boolean;

  /**
   * Text to show when loading
   */
  loadingText?: string;
}

const variantClasses = {
  "blue-purple":
    "from-blue-600 to-purple-700 hover:from-blue-700 hover:to-purple-800 focus:ring-blue-500",
  "green-emerald":
    "from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 focus:ring-green-500",
  "yellow-orange":
    "from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 focus:ring-yellow-500",
  red: "from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 focus:ring-red-500",
  blue: "from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 focus:ring-blue-500",
  green:
    "from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 focus:ring-green-500",
} as const;

const sizeClasses = {
  sm: "py-2 px-3 text-xs",
  md: "py-3 px-4 text-sm",
  lg: "py-4 px-6 text-base",
} as const;

/**
 * A reusable gradient button component with multiple variants and states
 *
 * @example
 * // Default blue-purple gradient
 * <GradientButton>Click me</GradientButton>
 *
 * @example
 * // Green button with loading state
 * <GradientButton variant="green" loading loadingText="Saving...">
 *   Save
 * </GradientButton>
 *
 * @example
 * // Full width red button
 * <GradientButton variant="red" fullWidth>
 *   Delete Account
 * </GradientButton>
 */
export const GradientButton = forwardRef<
  HTMLButtonElement,
  GradientButtonProps
>(
  (
    {
      variant = "blue-purple",
      size = "md",
      fullWidth = false,
      loading = false,
      loadingText,
      className,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          // Base styles
          "flex justify-center items-center border border-transparent rounded-xl shadow-sm font-semibold text-white bg-gradient-to-r transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
          // Variant styles
          variantClasses[variant],
          // Size styles
          sizeClasses[size],
          // Full width
          fullWidth && "w-full",
          // Custom classes
          className,
        )}
        {...props}
      >
        {loading && (
          <LoadingSpinner
            size={size === "sm" ? "sm" : "md"}
            color="white"
            className="-ml-1 mr-3"
          />
        )}
        {loading && loadingText ? loadingText : children}
      </button>
    );
  },
);

GradientButton.displayName = "GradientButton";
