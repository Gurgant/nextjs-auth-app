import { forwardRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Mail, Lock, User, Key, Shield, Eye, EyeOff } from "lucide-react";

interface InputWithIconProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /**
   * Icon to display in the input
   */
  icon: "mail" | "lock" | "user" | "key" | "shield";

  /**
   * Error message to display below the input
   */
  error?: string;

  /**
   * Color theme for focus ring
   */
  focusRing?: "blue" | "green" | "purple" | "red";

  /**
   * Whether to show password visibility toggle (only for type="password")
   */
  showPasswordToggle?: boolean;

  /**
   * Label text for the input
   */
  label?: string;

  /**
   * Whether the label is visually hidden (but still accessible)
   */
  srOnlyLabel?: boolean;
}

const iconMap = {
  mail: Mail,
  lock: Lock,
  user: User,
  key: Key,
  shield: Shield,
} as const;

const focusRingColors = {
  blue: "focus:ring-blue-500",
  green: "focus:ring-green-500",
  purple: "focus:ring-purple-500",
  red: "focus:ring-red-500",
} as const;

/**
 * A reusable input component with icon support
 *
 * @example
 * // Email input
 * <InputWithIcon
 *   icon="mail"
 *   type="email"
 *   placeholder="Enter your email"
 *   value={email}
 *   onChange={(e) => setEmail(e.target.value)}
 * />
 *
 * @example
 * // Password input with toggle
 * <InputWithIcon
 *   icon="lock"
 *   type="password"
 *   placeholder="Enter password"
 *   showPasswordToggle
 *   error={errors.password}
 * />
 */
export const InputWithIcon = forwardRef<HTMLInputElement, InputWithIconProps>(
  (
    {
      icon,
      error,
      focusRing = "blue",
      showPasswordToggle = false,
      label,
      srOnlyLabel = false,
      className,
      type = "text",
      id,
      ...props
    },
    ref,
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const Icon = iconMap[icon];

    // Determine actual input type
    const inputType = type === "password" && showPassword ? "text" : type;

    // Generate ID if not provided
    const inputId =
      id || `input-${icon}-${Math.random().toString(36).substr(2, 9)}`;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              "block text-sm font-semibold text-gray-700 mb-2",
              srOnlyLabel && "sr-only",
            )}
          >
            {label}
          </label>
        )}

        <div className="relative">
          {/* Icon */}
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icon
              className={cn(
                "h-5 w-5",
                error ? "text-red-400" : "text-gray-400",
              )}
            />
          </div>

          {/* Input */}
          <input
            ref={ref}
            id={inputId}
            type={inputType}
            className={cn(
              "block w-full pl-10 pr-4 py-3 border rounded-xl shadow-sm placeholder-gray-400",
              "focus:outline-none focus:ring-2 focus:border-transparent",
              "transition-all duration-200 bg-gray-50 focus:bg-white",
              error
                ? "border-red-300 text-red-900 placeholder-red-300 focus:ring-red-500"
                : "border-gray-200",
              !error && focusRingColors[focusRing],
              showPasswordToggle && type === "password" && "pr-12",
              className,
            )}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : undefined}
            {...props}
          />

          {/* Password Toggle */}
          {showPasswordToggle && type === "password" && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              ) : (
                <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              )}
            </button>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <p
            id={`${inputId}-error`}
            className="mt-1 text-sm text-red-600"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  },
);

InputWithIcon.displayName = "InputWithIcon";
