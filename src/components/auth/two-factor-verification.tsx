"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  verifyTwoFactorCode,
  type ActionResult,
} from "@/lib/actions/advanced-auth";
import { GradientButton } from "@/components/ui/gradient-button";
import { AlertMessage } from "@/components/ui/alert-message";

interface TwoFactorVerificationProps {
  userId: string;
  email: string;
  callbackUrl?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function TwoFactorVerification({
  userId,
  email,
  callbackUrl = "/",
  onSuccess,
  onCancel,
}: TwoFactorVerificationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("TwoFactor");

  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState(3);

  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [useBackupCode]);

  const handleVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setIsVerifying(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("code", code.trim());
      formData.append("useBackupCode", useBackupCode.toString());

      const verificationResult = await verifyTwoFactorCode(formData, userId);
      setResult(verificationResult);

      if (verificationResult.success) {
        // Complete the 2FA authentication process
        try {
          const finalCallbackUrl =
            searchParams.get("callbackUrl") || callbackUrl;

          // Call our 2FA completion API
          const completionResponse = await fetch("/api/auth/2fa/complete", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId,
              callbackUrl: finalCallbackUrl,
            }),
          });

          const completionResult = await completionResponse.json();

          if (completionResult.success) {
            console.log(
              "🔓 2FA completion successful, establishing session...",
            );

            // Force a full page reload to establish the new session
            // This allows NextAuth to create the proper session after 2FA completion
            if (onSuccess) {
              onSuccess();
            } else {
              // Use window.location.href for a full page reload/redirect
              window.location.href = finalCallbackUrl;
            }
          } else {
            setResult({
              success: false,
              message: completionResult.message || t("authFailure"),
            });
          }
        } catch (error) {
          console.error("Error completing 2FA authentication:", error);
          setResult({
            success: false,
            message: t("signInFailure"),
          });
        }
      } else {
        setAttemptsLeft((prev) => prev - 1);
        if (attemptsLeft <= 1) {
          // Too many failed attempts - redirect to login
          router.push("/auth/signin?error=2fa_failed" as any);
        }
        // Clear the code for retry
        setCode("");
      }
    } catch (error) {
      console.error("2FA verification error:", error);
      setResult({
        success: false,
        message: t("unexpectedError"),
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.push("/auth/signin" as any);
    }
  };

  const toggleBackupCode = () => {
    setUseBackupCode(!useBackupCode);
    setCode("");
    setResult(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <div className="max-w-md w-full">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
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
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {t("title")}
            </h1>
            <p className="text-gray-600">
              {useBackupCode
                ? t("backupCodeInstructions")
                : t("verificationCodeInstructions")}
            </p>
            <p className="text-sm text-gray-500 mt-2">{email}</p>
          </div>

          {/* Warning for low attempts */}
          {attemptsLeft <= 2 && attemptsLeft > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
              <div className="flex items-center">
                <svg
                  className="h-5 w-5 text-yellow-400 mr-2"
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
                <p className="text-sm font-medium text-yellow-800">
                  {t("attemptsRemaining", {
                    count: attemptsLeft,
                    plural: attemptsLeft !== 1 ? "s" : "",
                  })}
                </p>
              </div>
            </div>
          )}

          <form
            ref={formRef}
            onSubmit={handleVerification}
            className="space-y-6"
          >
            {/* Code Input */}
            <div>
              <label
                htmlFor="code"
                className="block text-sm font-semibold text-gray-700 mb-2"
              >
                {useBackupCode
                  ? t("backupCodeLabel")
                  : t("verificationCodeLabel")}
              </label>
              <input
                ref={inputRef}
                id="code"
                type="text"
                value={code}
                onChange={(e) => {
                  const value = e.target.value;
                  if (useBackupCode) {
                    // Backup code: allow letters, numbers, and dashes
                    setCode(
                      value
                        .toUpperCase()
                        .replace(/[^A-Z0-9-]/g, "")
                        .slice(0, 9),
                    );
                  } else {
                    // TOTP: only numbers, max 6 digits
                    setCode(value.replace(/\D/g, "").slice(0, 6));
                  }
                }}
                placeholder={
                  useBackupCode
                    ? t("backupCodePlaceholder")
                    : t("verificationCodePlaceholder")
                }
                className="block w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200 text-center text-2xl font-mono tracking-widest"
                maxLength={useBackupCode ? 9 : 6}
                required
                autoComplete="off"
              />
            </div>

            {/* Result Messages */}
            {result?.message && (
              <AlertMessage
                type={result.success ? "success" : "error"}
                message={result.message}
              />
            )}

            {/* Action Buttons */}
            <div className="space-y-4">
              <GradientButton
                type="submit"
                variant="red"
                fullWidth
                disabled={
                  !code.trim() ||
                  (useBackupCode ? code.length < 8 : code.length !== 6)
                }
                loading={isVerifying}
                loadingText={t("verifying")}
              >
                {t("verifyButton")}
              </GradientButton>

              {/* Toggle Backup Code */}
              <button
                type="button"
                onClick={toggleBackupCode}
                className="w-full text-sm text-gray-600 hover:text-gray-800 py-2"
              >
                {useBackupCode
                  ? t("useAuthenticatorInstead")
                  : t("useBackupCodeInstead")}
              </button>

              {/* Cancel */}
              <button
                type="button"
                onClick={handleCancel}
                className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-all duration-200"
              >
                {t("cancel")}
              </button>
            </div>
          </form>

          {/* Help Text */}
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              {useBackupCode ? t("backupCodeNote") : t("codeRefreshNote")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
