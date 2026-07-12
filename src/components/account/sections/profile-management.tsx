"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { GradientButton } from "@/components/ui/gradient-button";
import { AlertMessage } from "@/components/ui/alert-message";
import { isErrorResponse, getFieldError } from "@/lib/utils/form-responses";
import type { ActionResponse } from "@/lib/utils/form-responses";

interface ProfileManagementProps {
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  onProfileUpdate: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  isUpdatingProfile: boolean;
  profileResult: ActionResponse | null;
  profileFormRef: React.RefObject<HTMLFormElement | null>;
}

export const ProfileManagement = memo(function ProfileManagement({
  user,
  onProfileUpdate,
  isUpdatingProfile,
  profileResult,
  profileFormRef,
}: ProfileManagementProps) {
  const t = useTranslations("Account");
  const tCommon = useTranslations("Common");
  const tLoading = useTranslations("LoadingStates");

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
      <div className="flex items-center space-x-4 mb-6">
        <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
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
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">{t("profile")}</h2>
      </div>

      <form
        ref={profileFormRef}
        onSubmit={onProfileUpdate}
        className="space-y-6"
      >
        {/* Current User Info */}
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="flex items-center space-x-4">
            {user.image ? (
              <Image
                src={user.image}
                alt={user.name || "User"}
                width={48}
                height={48}
                className="w-12 h-12 rounded-full ring-2 ring-blue-100"
              />
            ) : (
              <div className="w-12 h-12 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full flex items-center justify-center">
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
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
            )}
            <div>
              <p className="font-medium text-gray-900">{user.name}</p>
              <p className="text-sm text-gray-600">{user.email}</p>
            </div>
          </div>
        </div>

        {/* Name Update */}
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-semibold text-gray-700 mb-2"
          >
            {tCommon("name")}
          </label>
          <input
            id="name"
            name="name"
            type="text"
            defaultValue={user.name || ""}
            required
            className="block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
            placeholder={t("yourFullNamePlaceholder")}
          />
          {profileResult &&
            isErrorResponse(profileResult) &&
            getFieldError(profileResult, "name") && (
              <p className="mt-1 text-sm text-red-600">
                {getFieldError(profileResult, "name")}
              </p>
            )}
        </div>

        {/* Success/Error Messages */}
        {profileResult?.message && (
          <AlertMessage
            type={profileResult.success ? "success" : "error"}
            message={profileResult.message}
          />
        )}

        <GradientButton
          type="submit"
          variant="blue"
          fullWidth
          loading={isUpdatingProfile}
          loadingText={tLoading("updating")}
        >
          {t("updateProfile")}
        </GradientButton>
      </form>
    </div>
  );
});
