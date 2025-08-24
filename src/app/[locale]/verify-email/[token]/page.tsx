import { verifyEmailToken } from "@/lib/actions/advanced-auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { FormPageLayout } from "@/components/layouts";

interface Props {
  params: Promise<{
    locale: string;
    token: string;
  }>;
}

export default async function VerifyEmailPage({ params }: Props) {
  const { locale, token } = await params;
  const t = await getTranslations("EmailVerification");

  // Verify the email token with locale
  const result = await verifyEmailToken(token, locale);

  return (
    <FormPageLayout>
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8 text-center">
        {result.success ? (
          <>
            {/* Success State */}
            <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              {t("successTitle")}
            </h1>

            <p className="text-gray-600 mb-8">{t("successMessage")}</p>

            <div className="space-y-4">
              <Link
                href={`/${locale}/dashboard`}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
              >
                {t("goToDashboard")}
              </Link>

              <Link
                href={`/${locale}/account`}
                className="w-full flex justify-center py-3 px-4 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
              >
                {t("manageAccount")}
              </Link>
            </div>
          </>
        ) : (
          <>
            {/* Error State */}
            <div className="w-16 h-16 bg-gradient-to-r from-red-500 to-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              {t("failureTitle")}
            </h1>

            <p className="text-gray-600 mb-2">
              {result.message || t("defaultFailureMessage")}
            </p>

            <p className="text-sm text-gray-500 mb-8">
              {t("requestNewVerification")}
            </p>

            <div className="space-y-4">
              <Link
                href={`/${locale}/account`}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
              >
                {t("goToAccountSettings")}
              </Link>

              <Link
                href={`/${locale}`}
                className="w-full flex justify-center py-3 px-4 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
              >
                {t("backToHome")}
              </Link>
            </div>
          </>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500">{t("needHelp")}</p>
        </div>
      </div>
    </FormPageLayout>
  );
}

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "EmailVerification" });

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}
