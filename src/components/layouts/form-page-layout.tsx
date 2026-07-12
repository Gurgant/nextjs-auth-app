import { GradientPageLayout } from "./gradient-page-layout";
import { CenteredContentLayout } from "./centered-content-layout";

interface FormPageLayoutProps {
  children: React.ReactNode;
  gradient?: "default" | "blue-purple" | "green-blue" | "purple-pink";
  maxWidth?: "sm" | "md" | "lg";
}

/**
 * Specialized layout for form pages combining gradient background with centered content
 * Perfect for authentication forms like login, register, etc.
 *
 * @example
 * <FormPageLayout>
 *   <RegistrationForm />
 * </FormPageLayout>
 *
 * @example
 * // With custom gradient and width
 * <FormPageLayout gradient="green-blue" maxWidth="lg">
 *   <ComplexForm />
 * </FormPageLayout>
 */
export function FormPageLayout({
  children,
  gradient = "default",
  maxWidth = "md",
}: FormPageLayoutProps) {
  return (
    <GradientPageLayout gradient={gradient}>
      <CenteredContentLayout maxWidth={maxWidth}>
        {children}
      </CenteredContentLayout>
    </GradientPageLayout>
  );
}
