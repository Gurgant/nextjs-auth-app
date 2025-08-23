import { auth } from "@/lib/auth";
import { AccountManagement } from "@/components/account/account-management";
import { AuthGuard, DashboardLayout } from "@/components/layouts";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function AccountPage({ params }: Props) {
  const session = await auth();
  const { locale } = await params;

  return (
    <AuthGuard locale={locale} requireAuth>
      {session?.user ? (
        <DashboardLayout gradient maxWidth="4xl">
          <AccountManagement user={session.user} locale={locale} />
        </DashboardLayout>
      ) : null}
    </AuthGuard>
  );
}
