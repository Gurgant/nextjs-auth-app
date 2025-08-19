import { cn } from '@/lib/utils'

interface GradientPageLayoutProps {
  children: React.ReactNode
  className?: string
  gradient?: 'default' | 'blue-purple' | 'green-blue' | 'purple-pink'
}

const gradients = {
  'default': 'from-blue-50 via-white to-purple-50',
  'blue-purple': 'from-blue-50 via-white to-purple-50',
  'green-blue': 'from-green-50 via-white to-blue-50',
  'purple-pink': 'from-purple-50 via-white to-pink-50'
} as const

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
 * // With custom gradient
 * <GradientPageLayout gradient="green-blue" className="py-12">
 *   <YourContent />
 * </GradientPageLayout>
 */
export function GradientPageLayout({ 
  children, 
  className,
  gradient = 'default' 
}: GradientPageLayoutProps) {
  return (
    <div 
      className={cn(
        'min-h-[calc(100vh-4rem)] bg-gradient-to-br',
        gradients[gradient],
        className
      )}
    >
      {children}
    </div>
  )
}