import { auth } from "@/lib/auth";
import { AccountPageWrapper } from "@/components/account/account-page-wrapper";
import { AuthGuard, DashboardLayout } from "@/components/layouts";

interface Props {
  params: Promise<{ locale: string }>;
}

// Metadata for better SEO and performance
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;

  return {
    title: "Account Management",
    description: "Manage your account settings, security, and preferences",
    robots: "noindex", // Private page
  };
}

export default async function AccountPage({ params }: Props) {
  const session = await auth();
  const { locale } = await params;

  return (
    <AuthGuard locale={locale} requireAuth>
      {session?.user ? (
        <DashboardLayout gradient maxWidth="4xl">
          <AccountPageWrapper user={session.user} locale={locale} />
        </DashboardLayout>
      ) : null}
    </AuthGuard>
  );
}
