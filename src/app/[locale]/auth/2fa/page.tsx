import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { TwoFactorVerification } from "@/components/auth/two-factor-verification";
import { getEnhancedUserAccountInfo } from "@/lib/actions/advanced-auth";
import { getTranslations } from "next-intl/server";
import { AlertMessage } from "@/components/ui/alert-message";

interface TwoFactorPageProps {
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<{
    userId?: string;
    email?: string;
    callbackUrl?: string;
    error?: string;
  }>;
}

export default async function TwoFactorPage({
  params,
  searchParams,
}: TwoFactorPageProps) {
  const { locale } = await params;
  const { userId, email, callbackUrl, error } = await searchParams;
  const t = await getTranslations("TwoFactor");

  // Check if user is already fully authenticated
  const session = await auth();
  if (session?.user?.id && !userId) {
    // User is already signed in, redirect to dashboard
    redirect(callbackUrl || `/${locale}`);
  }

  // Validate required parameters
  if (!userId || !email) {
    console.error("2FA page: Missing required parameters (userId or email)");
    redirect(`/${locale}/auth/signin?error=missing_params`);
  }

  // Verify user exists and has 2FA enabled
  try {
    const accountInfo = await getEnhancedUserAccountInfo(userId);

    if (!accountInfo.success || !accountInfo.data?.twoFactorEnabled) {
      console.error("2FA page: User not found or 2FA not enabled");
      redirect(`/${locale}/auth/signin?error=2fa_not_enabled`);
    }

    // Check if user email matches
    if (accountInfo.data.email !== email) {
      console.error("2FA page: Email mismatch");
      redirect(`/${locale}/auth/signin?error=invalid_session`);
    }
  } catch (error) {
    console.error("2FA page: Error verifying user:", error);
    redirect(`/${locale}/auth/signin?error=verification_failed`);
  }

  return (
    <div className="min-h-screen">
      {/* Error Message */}
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50">
          <AlertMessage
            type="error"
            message={
              error === "2fa_failed"
                ? t("tooManyAttempts")
                : error === "invalid_code"
                  ? t("invalidCode")
                  : error === "expired"
                    ? t("sessionExpired")
                    : t("authError")
            }
            className="shadow-lg"
          />
        </div>
      )}

      <TwoFactorVerification
        userId={userId}
        email={email}
        callbackUrl={callbackUrl || `/${locale}`}
      />
    </div>
  );
}

// Generate metadata for the page
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const t = await getTranslations("TwoFactor");

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: "noindex, nofollow", // Don't index auth pages
  };
}
