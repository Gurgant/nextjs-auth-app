import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface AlertMessageProps {
  /**
   * Type of alert
   */
  type: 'success' | 'error' | 'warning' | 'info';
  
  /**
   * Main message to display
   */
  message: string;
  
  /**
   * Optional field-specific errors
   */
  errors?: Record<string, string>;
  
  /**
   * Optional dismiss handler
   */
  onDismiss?: () => void;
  
  /**
   * Additional CSS classes
   */
  className?: string;
}

const typeConfig = {
  success: {
    container: 'bg-green-50 border-green-200',
    icon: 'text-green-400',
    text: 'text-green-700',
    iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
  },
  error: {
    container: 'bg-red-50 border-red-200',
    icon: 'text-red-400',
    text: 'text-red-700',
    iconPath: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
  },
  warning: {
    container: 'bg-yellow-50 border-yellow-200',
    icon: 'text-yellow-400',
    text: 'text-yellow-700',
    iconPath: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
  },
  info: {
    container: 'bg-blue-50 border-blue-200',
    icon: 'text-blue-400',
    text: 'text-blue-700',
    iconPath: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
  }
} as const;

/**
 * A reusable alert message component with multiple variants
 * 
 * @example
 * // Simple success message
 * <AlertMessage type="success" message="Account created successfully!" />
 * 
 * @example
 * // Error with field errors
 * <AlertMessage 
 *   type="error" 
 *   message="Please fix the following errors"
 *   errors={{ email: "Invalid email", password: "Too short" }}
 * />
 * 
 * @example
 * // Dismissible warning
 * <AlertMessage 
 *   type="warning" 
 *   message="Your session will expire soon"
 *   onDismiss={() => setShowWarning(false)}
 * />
 */
export function AlertMessage({ 
  type, 
  message, 
  errors, 
  onDismiss,
  className 
}: AlertMessageProps) {
  const config = typeConfig[type];
  
  return (
    <div
      className={cn(
        'rounded-xl p-4 border',
        config.container,
        className
      )}
      role="alert"
    >
      <div className="flex items-start">
        <svg
          className={cn('h-5 w-5 flex-shrink-0', config.icon)}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={config.iconPath}
          />
        </svg>
        
        <div className="ml-3 flex-1">
          <p className={cn('text-sm font-medium', config.text)}>
            {message}
          </p>
          
          {errors && Object.keys(errors).length > 0 && (
            <div className="mt-2 space-y-1">
              {Object.entries(errors).map(([field, error]) => (
                <p key={field} className={cn('text-sm', config.text)}>
                  <span className="font-medium capitalize">{field}:</span> {error}
                </p>
              ))}
            </div>
          )}
        </div>
        
        {onDismiss && (
          <button
            onClick={onDismiss}
            className={cn(
              'ml-3 inline-flex rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-offset-2',
              config.text,
              type === 'success' && 'hover:bg-green-100 focus:ring-green-600',
              type === 'error' && 'hover:bg-red-100 focus:ring-red-600',
              type === 'warning' && 'hover:bg-yellow-100 focus:ring-yellow-600',
              type === 'info' && 'hover:bg-blue-100 focus:ring-blue-600'
            )}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}