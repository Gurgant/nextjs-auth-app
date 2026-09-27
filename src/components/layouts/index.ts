/**
 * Layout Components
 *
 * A collection of reusable layout components that implement
 * common UI patterns across the application.
 */

// AuthGuard is deliberately NOT re-exported: it is a server component that
// imports auth(), and Client Components import this barrel — re-exporting it
// here shipped the server auth code to the browser. Import it from
// "@/components/layouts/auth-guard" in server components.
export { GradientPageLayout } from "./gradient-page-layout";
export { CenteredContentLayout } from "./centered-content-layout";
export { FormPageLayout } from "./form-page-layout";
export { DashboardLayout } from "./dashboard-layout";
export { LoadingLayout } from "./loading-layout";
