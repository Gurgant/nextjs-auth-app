"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";
import { GradientButton } from "@/components/ui/gradient-button";
import { AlertMessage } from "@/components/ui/alert-message";
import {
  isErrorResponse,
  getAllFieldErrors,
  type ActionResponse,
} from "@/lib/utils/form-responses";

interface PasswordManagementProps {
  accountInfo: {
    hasGoogleAccount?: boolean;
    hasPassword?: boolean;
  } | null;
  isLoadingAccountInfo: boolean;
  onAddPassword: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onChangePassword: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  isAddingPassword: boolean;
  isChangingPassword: boolean;
  passwordResult: ActionResponse | null;
  changePasswordResult: ActionResponse | null;
  addPasswordFormRef: React.RefObject<HTMLFormElement | null>;
  changePasswordFormRef: React.RefObject<HTMLFormElement | null>;
}

export const PasswordManagement = memo(function PasswordManagement({
  accountInfo,
  isLoadingAccountInfo,
  onAddPassword,
  onChangePassword,
  isAddingPassword,
  isChangingPassword,
  passwordResult,
  changePasswordResult,
  addPasswordFormRef,
  changePasswordFormRef,
}: PasswordManagementProps) {
  const t = useTranslations("Account");
  const tCommon = useTranslations("Common");
  const tLoading = useTranslations("LoadingStates");

  if (isLoadingAccountInfo) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
        <div className="flex items-center space-x-4 mb-6">
          <div className="w-12 h-12 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-xl flex items-center justify-center">
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
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">
            {t("passwordManagement")}
          </h2>
        </div>
        <div className="animate-pulse bg-gray-200 h-32 rounded-xl"></div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
      <div className="flex items-center space-x-4 mb-6">
        <div className="w-12 h-12 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-xl flex items-center justify-center">
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
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">
          {t("passwordManagement")}
        </h2>
      </div>

      <div className="space-y-6">
        {/* Set Password for Google Users */}
        {accountInfo?.hasGoogleAccount && !accountInfo?.hasPassword && (
          <div>
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {t("setPassword")}
              </h3>
              <p className="text-gray-600 text-sm">
                {t("addPasswordDescription")}
              </p>
            </div>

            <form
              ref={addPasswordFormRef}
              onSubmit={onAddPassword}
              className="space-y-4"
            >
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  {tCommon("password")}
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                  placeholder={t("enterNewPasswordPlaceholder")}
                />
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  {tCommon("confirmPassword")}
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  className="block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                  placeholder={t("confirmNewPasswordPlaceholder")}
                />
              </div>

              {passwordResult?.message && (
                <AlertMessage
                  type={passwordResult.success ? "success" : "error"}
                  message={passwordResult.message}
                />
              )}

              {passwordResult &&
                isErrorResponse(passwordResult) &&
                getAllFieldErrors(passwordResult).length > 0 && (
                  <div className="mt-2">
                    {getAllFieldErrors(passwordResult).map((error, index) => (
                      <p key={index} className="text-sm text-red-600">
                        {error}
                      </p>
                    ))}
                  </div>
                )}

              <GradientButton
                type="submit"
                variant="yellow-orange"
                fullWidth
                loading={isAddingPassword}
                loadingText={tLoading("updating")}
              >
                {t("setPassword")}
              </GradientButton>
            </form>
          </div>
        )}

        {/* Change Password for Users with Existing Password */}
        {accountInfo?.hasPassword && (
          <div>
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {t("changePassword")}
              </h3>
              <p className="text-gray-600 text-sm">
                {t("changePasswordDescription")}
              </p>
            </div>

            <form
              ref={changePasswordFormRef}
              onSubmit={onChangePassword}
              className="space-y-4"
            >
              <div>
                <label
                  htmlFor="currentPassword"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  {t("currentPassword")}
                </label>
                <input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  required
                  className="block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                  placeholder={t("enterCurrentPasswordPlaceholder")}
                />
              </div>

              <div>
                <label
                  htmlFor="newPassword"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  {t("newPassword")}
                </label>
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  required
                  className="block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                  placeholder={t("enterNewPasswordPlaceholder")}
                />
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  {t("confirmNewPassword")}
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  className="block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                  placeholder={t("confirmNewPasswordPlaceholder")}
                />
              </div>

              {changePasswordResult?.message && (
                <AlertMessage
                  type={changePasswordResult.success ? "success" : "error"}
                  message={changePasswordResult.message}
                />
              )}

              {changePasswordResult &&
                isErrorResponse(changePasswordResult) &&
                getAllFieldErrors(changePasswordResult).length > 0 && (
                  <div className="mt-2">
                    {getAllFieldErrors(changePasswordResult).map(
                      (error, index) => (
                        <p key={index} className="text-sm text-red-600">
                          {error}
                        </p>
                      ),
                    )}
                  </div>
                )}

              <GradientButton
                type="submit"
                variant="yellow-orange"
                fullWidth
                loading={isChangingPassword}
                loadingText={tLoading("updating")}
              >
                {t("changePassword")}
              </GradientButton>
            </form>
          </div>
        )}

        {/* No Password Options Available */}
        {!accountInfo?.hasGoogleAccount && !accountInfo?.hasPassword && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-gray-400"
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
            </div>
            <p className="text-gray-600">{t("noPasswordOptionsAvailable")}</p>
          </div>
        )}
      </div>
    </div>
  );
});
