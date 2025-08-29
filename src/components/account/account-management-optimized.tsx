"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  updateUserProfile,
  deleteUserAccount,
  addPasswordToGoogleUser,
  changeUserPassword,
  type ActionResult,
} from "@/lib/actions/auth";
import {
  sendEmailVerification,
  disableTwoFactorAuth,
} from "@/lib/actions/advanced-auth";
import { TwoFactorSetup } from "@/components/security/two-factor-setup";
import { OAuthAccountLinking } from "@/components/account/oauth-account-linking";
import { useLocalizedAction } from "@/hooks/use-localized-action";
import { useFormReset } from "@/hooks/use-form-reset";
import { useAccountData } from "@/hooks/use-account-data";
import { ProfileManagement } from "./sections/profile-management";
import { AuthProviders } from "./sections/auth-providers";
import { PasswordManagement } from "./sections/password-management";
import { GradientButton } from "@/components/ui/gradient-button";
import { AlertMessage } from "@/components/ui/alert-message";
import type { ActionResponse } from "@/lib/utils/form-responses";
import { routes } from "@/utils/navigation";
import type { Locale } from "@/config/i18n";

interface AccountManagementProps {
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  locale: string;
}

export function AccountManagement({ user, locale }: AccountManagementProps) {
  const t = useTranslations("Account");
  const tCommon = useTranslations("Common");
  const tErrors = useTranslations("ComponentErrors");
  const tConsole = useTranslations("ConsoleMessages");
  const tLoading = useTranslations("LoadingStates");
  const router = useRouter();

  // UI state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [emailConfirmation, setEmailConfirmation] = useState("");
  const [showTwoFactorSetup, setShowTwoFactorSetup] = useState(false);

  // Advanced authentication state
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [verificationResult, setVerificationResult] =
    useState<ActionResponse | null>(null);

  // Load account data with custom hook
  const {
    accountInfo,
    isLoading: isLoadingAccountInfo,
    refetch: refetchAccountInfo,
  } = useAccountData(user.id);

  // Hook-based action management
  const {
    execute: executeProfileUpdate,
    isLoading: isUpdatingProfile,
    result: profileResult,
  } = useLocalizedAction(
    async (formData: FormData) => updateUserProfile(formData, user.id!),
    locale,
    {
      onSuccess: () => {
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      },
    },
  );

  const {
    execute: executeAccountDeletion,
    isLoading: isDeletingAccount,
    result: deleteResult,
  } = useLocalizedAction(
    async (formData: FormData) => deleteUserAccount(formData, user.email!),
    locale,
    {
      onSuccess: () => {
        setTimeout(async () => {
          await signOut({ callbackUrl: `/${locale}?deleted=true` });
        }, 2000);
      },
    },
  );

  const {
    execute: executeAddPassword,
    isLoading: isAddingPassword,
    result: passwordResult,
  } = useLocalizedAction(
    async (formData: FormData) => addPasswordToGoogleUser(formData, user.id!),
    locale,
    {
      onSuccess: async () => {
        setTimeout(async () => {
          try {
            await refetchAccountInfo();
            resetAddPasswordForm();
          } catch (error) {
            handleFormError(error, tConsole("accountInfoRefresh"));
          }
        }, 1500);
      },
    },
  );

  const {
    execute: executeChangePassword,
    isLoading: isChangingPassword,
    result: changePasswordResult,
  } = useLocalizedAction(
    async (formData: FormData) => changeUserPassword(formData, user.id!),
    locale,
    {
      onSuccess: () => {
        setTimeout(() => {
          resetChangePasswordForm();
        }, 1500);
      },
    },
  );

  // Form reset hooks
  const { formRef: addPasswordFormRef, resetForm: resetAddPasswordForm } =
    useFormReset({
      formName: "AddPasswordForm",
    });

  const { formRef: changePasswordFormRef, resetForm: resetChangePasswordForm } =
    useFormReset({
      formName: "ChangePasswordForm",
    });

  const { formRef: profileFormRef, resetForm: resetProfileForm } = useFormReset(
    {
      formName: "ProfileUpdateForm",
    },
  );

  // Enhanced error handler for consistent error management
  const handleFormError = useCallback((error: unknown, action: string) => {
    console.error(`❌ Error during ${action}:`, error);
  }, []);

  // Form handlers
  const handleProfileUpdate = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      await executeProfileUpdate(formData);
    },
    [executeProfileUpdate],
  );

  const handleAccountDeletion = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      await executeAccountDeletion(formData);
    },
    [executeAccountDeletion],
  );

  const handleAddPassword = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      await executeAddPassword(formData);
    },
    [executeAddPassword],
  );

  const handleChangePassword = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      await executeChangePassword(formData);
    },
    [executeChangePassword],
  );

  // Send email verification
  const handleSendEmailVerification = useCallback(async () => {
    if (!user.email) return;

    setIsSendingVerification(true);
    setVerificationResult(null);

    try {
      const result = await sendEmailVerification(user.email, locale);
      setVerificationResult(result as ActionResponse);

      if (result.success) {
        setTimeout(async () => {
          await refetchAccountInfo();
        }, 1000);
      }
    } catch (error) {
      handleFormError(error, tConsole("emailVerificationSending"));
      setVerificationResult({
        success: false,
        message: tErrors("failedToSendVerificationEmail"),
      });
    } finally {
      setIsSendingVerification(false);
    }
  }, [
    user.email,
    locale,
    refetchAccountInfo,
    handleFormError,
    tConsole,
    tErrors,
  ]);

  // Handle 2FA setup completion
  const handleTwoFactorSetupComplete = useCallback(async () => {
    setShowTwoFactorSetup(false);
    await refetchAccountInfo();
  }, [refetchAccountInfo]);

  // Handle 2FA disable
  const handleDisableTwoFactor = useCallback(async () => {
    if (!user.id) return;

    const confirmed = window.confirm(t("disableTwoFactorConfirm"));
    if (!confirmed) return;

    try {
      const result = await disableTwoFactorAuth(user.id);

      if (result.success) {
        await refetchAccountInfo();
      }
    } catch (error) {
      handleFormError(error, "2FA disable");
    }
  }, [user.id, t, refetchAccountInfo, handleFormError]);

  return (
    <>
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
          <svg
            className="w-10 h-10 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
          {t("title")}
        </h1>
        <p className="text-gray-600 text-lg">{t("subtitle")}</p>
      </div>

      {/* Dashboard Navigation */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {t("dashboard")}
              </h2>
              <p className="text-sm text-gray-600">
                {t("dashboardDescription")}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              const dashboardPath = routes.dashboard(locale as Locale);
              router.push(dashboardPath as any);
            }}
            className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-xl text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
            {t("goToDashboard")}
          </button>
        </div>
      </div>

      {/* Account Providers Section */}
      <AuthProviders
        accountInfo={accountInfo}
        isLoading={isLoadingAccountInfo}
      />

      {/* OAuth Account Linking */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
        <div className="flex items-center space-x-4 mb-6">
          <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-blue-600 rounded-xl flex items-center justify-center">
            <svg
              className="w-6 h-6 text-white"
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
          <h2 className="text-xl font-semibold text-gray-900">
            {t("accountLinking")}
          </h2>
        </div>

        {accountInfo && (
          <OAuthAccountLinking
            accountInfo={{
              hasGoogleAccount: accountInfo.hasGoogleAccount,
              hasEmailAccount: accountInfo.hasPassword,
              primaryAuthMethod: accountInfo.primaryAuthMethod,
            }}
            onAccountLinked={refetchAccountInfo}
          />
        )}
      </div>

      <div className="grid gap-8 md:grid-cols-1 lg:grid-cols-2">
        {/* Profile Management */}
        <ProfileManagement
          user={user}
          onProfileUpdate={handleProfileUpdate}
          isUpdatingProfile={isUpdatingProfile}
          profileResult={profileResult}
          profileFormRef={profileFormRef}
        />

        {/* Password Management */}
        <PasswordManagement
          accountInfo={accountInfo}
          isLoadingAccountInfo={isLoadingAccountInfo}
          onAddPassword={handleAddPassword}
          onChangePassword={handleChangePassword}
          isAddingPassword={isAddingPassword}
          isChangingPassword={isChangingPassword}
          passwordResult={passwordResult}
          changePasswordResult={changePasswordResult}
          addPasswordFormRef={addPasswordFormRef}
          changePasswordFormRef={changePasswordFormRef}
        />

        {/* Email Verification Status */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-teal-500 rounded-xl flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              {t("emailVerification")}
            </h2>
          </div>

          <div className="space-y-4">
            {user.email && (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        accountInfo?.emailVerified
                          ? "bg-green-500"
                          : "bg-yellow-500"
                      }`}
                    ></div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {user.email}
                    </p>
                    <p className="text-xs text-gray-500">
                      {t("primaryEmailAddress")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {accountInfo?.emailVerified ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {t("verified")}
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        {t("unverified")}
                      </span>
                      <button
                        onClick={handleSendEmailVerification}
                        disabled={isSendingVerification}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                      >
                        {isSendingVerification ? t("sending") : t("verify")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {verificationResult?.message && (
              <AlertMessage
                type={verificationResult.success ? "success" : "error"}
                message={verificationResult.message}
              />
            )}

            <p className="text-sm text-gray-600">
              {t("emailVerificationDescription")}
            </p>
          </div>
        </div>

        {/* Two-Factor Authentication */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              {t("twoFactorAuthentication")}
            </h2>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {t("authenticatorApp")}
                </p>
                <p className="text-xs text-gray-500">
                  {t("addExtraSecurityDescription")}
                </p>
                {accountInfo?.twoFactorEnabled &&
                  accountInfo?.backupCodesCount !== undefined && (
                    <p className="text-xs text-green-600 mt-1">
                      {t("backupCodesAvailable", {
                        count: accountInfo.backupCodesCount,
                      })}
                    </p>
                  )}
              </div>
              <div className="flex items-center space-x-3">
                {accountInfo?.twoFactorEnabled ? (
                  <>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {t("enabled")}
                    </span>
                    <button
                      onClick={handleDisableTwoFactor}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      {t("disableTwoFactor")}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      {t("disabled")}
                    </span>
                    <button
                      onClick={() => setShowTwoFactorSetup(true)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      {t("enableTwoFactor")}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start">
                <svg
                  className="h-5 w-5 text-blue-400 mr-2 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <h4 className="text-sm font-medium text-blue-800 mb-1">
                    {t("enhancedSecurity")}
                  </h4>
                  <p className="text-sm text-blue-700">
                    {t("twoFactorSecurityDescription")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-red-200/50">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-red-600 rounded-xl flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-red-900">
              {t("dangerZone")}
            </h2>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {t("accountDeletion")}
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                {t("deleteAccountWarning")}
              </p>
            </div>

            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full flex justify-center items-center py-3 px-4 border border-red-200 rounded-xl shadow-sm text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all duration-200"
              >
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                {t("deleteAccount")}
              </button>
            ) : (
              <div className="space-y-4">
                <AlertMessage type="error" message={t("dangerZoneWarning")} />

                <form onSubmit={handleAccountDeletion} className="space-y-4">
                  <div>
                    <label
                      htmlFor="confirmEmail"
                      className="block text-sm font-semibold text-gray-700 mb-2"
                    >
                      {t("typeEmailToConfirm", { email: user.email || "" })}
                    </label>
                    <input
                      id="confirmEmail"
                      name="confirmEmail"
                      type="email"
                      value={emailConfirmation}
                      onChange={(e) => setEmailConfirmation(e.target.value)}
                      required
                      className="block w-full px-4 py-3 border border-red-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200 bg-red-50 focus:bg-white"
                      placeholder={user.email || ""}
                    />
                  </div>

                  {deleteResult?.message && (
                    <AlertMessage
                      type={deleteResult.success ? "success" : "error"}
                      message={deleteResult.message}
                    />
                  )}

                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setEmailConfirmation("");
                      }}
                      className="flex-1 py-3 px-4 border border-gray-200 rounded-xl shadow-sm text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-all duration-200"
                    >
                      {tCommon("cancel")}
                    </button>
                    <GradientButton
                      type="submit"
                      variant="red"
                      className="flex-1"
                      disabled={emailConfirmation !== user.email}
                      loading={isDeletingAccount}
                      loadingText={tLoading("deleting")}
                    >
                      {t("deleteAccount")}
                    </GradientButton>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Two-Factor Authentication Setup Modal */}
      {showTwoFactorSetup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <TwoFactorSetup
              user={user}
              locale={locale}
              onSetupComplete={handleTwoFactorSetupComplete}
              onCancel={() => setShowTwoFactorSetup(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
