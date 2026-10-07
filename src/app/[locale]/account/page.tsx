import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { AccountPageWrapper } from "@/components/account/account-page-wrapper";
import { DashboardLayout } from "@/components/layouts";
import { AuthGuard } from "@/components/layouts/auth-guard";

interface Props {
  params: Promise<{ locale: string }>;
}

// As the terms, privacy and verification pages: the heading of the page, then
// the name of the application, in the language of the address.
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Account" });
  const tLayout = await getTranslations({ locale, namespace: "Layout" });

  return {
    title: `${t("title")} - ${tLayout("appTitle")}`,
    description: t("subtitle"),
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
