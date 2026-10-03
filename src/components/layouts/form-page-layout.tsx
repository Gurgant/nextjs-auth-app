import { GradientPageLayout } from "./gradient-page-layout";
import { CenteredContentLayout } from "./centered-content-layout";

interface FormPageLayoutProps {
  children: React.ReactNode;
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
 * // With custom width
 * <FormPageLayout maxWidth="lg">
 *   <ComplexForm />
 * </FormPageLayout>
 */
export function FormPageLayout({
  children,
  maxWidth = "md",
}: FormPageLayoutProps) {
  return (
    <GradientPageLayout>
      <CenteredContentLayout maxWidth={maxWidth}>
        {children}
      </CenteredContentLayout>
    </GradientPageLayout>
  );
}
