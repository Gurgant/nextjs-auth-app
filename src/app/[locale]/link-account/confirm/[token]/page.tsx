import { confirmAccountLinking } from "@/lib/actions/advanced-auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AlertMessage } from "@/components/ui/alert-message";
import { FormPageLayout } from "@/components/layouts";

interface Props {
  params: Promise<{
    locale: string;
    token: string;
  }>;
}

export default async function ConfirmAccountLinkingPage({ params }: Props) {
  const { locale, token } = await params;
  const t = await getTranslations("AccountLinking");

  // Confirm the account linking with locale
  const result = await confirmAccountLinking(token, locale);

  return (
    <FormPageLayout gradient="green-blue">
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
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              {t("successTitle")}
            </h1>

            <p className="text-gray-600 mb-8">{t("successMessage")}</p>

            <AlertMessage
              type="success"
              message={t("enhancedSecurity")}
              className="mb-6"
            />

            <div className="space-y-4">
              <Link
                href={`/${locale}/account`}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all duration-200"
              >
                {t("manageAccountSettings")}
              </Link>

              <Link
                href={`/${locale}/account`}
                className="w-full flex justify-center py-3 px-4 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all duration-200"
              >
                {t("goToDashboard")}
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

            <AlertMessage
              type="error"
              message={t("tryAgainInstructions")}
              className="mb-6"
            />

            <div className="space-y-4">
              <Link
                href={`/${locale}/account`}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
              >
                {t("tryAgainAccountSettings")}
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

        {/* Security Notice */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-center text-xs text-gray-500">
            <svg
              className="w-4 h-4 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            {t("securityNotice")}
          </div>
        </div>
      </div>
    </FormPageLayout>
  );
}

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "AccountLinking" });

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}
