"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Shield,
  AlertCircle,
  CheckCircle,
  Link as LinkIcon,
  Unlink,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useSafeLocale } from "@/hooks/use-safe-locale";

interface AccountLinkingProps {
  accountInfo: {
    hasGoogleAccount: boolean;
    hasEmailAccount: boolean;
    primaryAuthMethod?: string;
  };
  onAccountLinked: () => void;
}

export function OAuthAccountLinking({
  accountInfo,
  onAccountLinked,
}: AccountLinkingProps) {
  const locale = useSafeLocale();
  const t = useTranslations("Account");
  const tCommon = useTranslations("Common");
  const [isLinking, setIsLinking] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [linkingProvider, setLinkingProvider] = useState<"google" | null>(null);
  const [unlinkingProvider, setUnlinkingProvider] = useState<"google" | null>(
    null,
  );
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleLinkAccount = async (provider: "google") => {
    if (!password.trim()) {
      setResult({ success: false, message: t("passwordRequired") });
      return;
    }

    setIsLinking(true);
    setResult(null);

    try {
      // Step 1: Initiate account linking
      const response = await fetch("/api/auth/link-account/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, provider }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setResult({
          success: false,
          message: data.error || t("failedToInitiateAccountLinking"),
        });
        return;
      }

      // Step 2: Store the link token and redirect to OAuth
      sessionStorage.setItem("accountLinkToken", data.linkToken);

      // Step 3: Redirect to OAuth provider with special state
      const result = await signIn(provider, {
        redirect: false,
        callbackUrl: `/${locale}/account?linked=${provider}`,
      });

      if (result?.error) {
        setResult({ success: false, message: t("oauthAuthenticationFailed") });
      } else if (result?.url) {
        // OAuth succeeded - the callback will handle account linking
        window.location.href = result.url;
      }
    } catch (error) {
      console.error("Account linking error:", error);
      setResult({ success: false, message: t("failedToLinkAccount") });
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkAccount = async (provider: "google") => {
    if (!password.trim()) {
      setResult({ success: false, message: t("passwordRequired") });
      return;
    }

    setIsUnlinking(true);
    setResult(null);

    try {
      const response = await fetch("/api/auth/link-account/unlink", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, provider }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setResult({
          success: false,
          message: data.error || t("failedToUnlinkAccount"),
        });
        return;
      }

      setResult({ success: true, message: t("accountUnlinkedSuccessfully") });
      setShowPasswordPrompt(false);
      setPassword("");
      onAccountLinked(); // Refresh account info
    } catch (error) {
      console.error("Account unlinking error:", error);
      setResult({ success: false, message: t("failedToUnlinkAccount") });
    } finally {
      setIsUnlinking(false);
    }
  };

  const startLinkProcess = (provider: "google") => {
    setLinkingProvider(provider);
    setShowPasswordPrompt(true);
    setResult(null);
  };

  const startUnlinkProcess = (provider: "google") => {
    setUnlinkingProvider(provider);
    setShowPasswordPrompt(true);
    setResult(null);
  };

  const cancelProcess = () => {
    setShowPasswordPrompt(false);
    setLinkingProvider(null);
    setUnlinkingProvider(null);
    setPassword("");
    setResult(null);
  };

  const isProcessing = isLinking || isUnlinking;

  return (
    <div className="space-y-6">
      {/* Google Account */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <CardTitle>{t("googleAccountTitle")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${accountInfo.hasGoogleAccount ? "bg-green-500" : "bg-gray-300"}`}
              />
              <div>
                <p className="font-medium">
                  {accountInfo.hasGoogleAccount ? t("linked") : t("notLinked")}
                </p>
                <p className="text-sm text-gray-600">
                  {accountInfo.hasGoogleAccount
                    ? t("googleSignInDescription")
                    : t("googleLinkDescription")}
                </p>
              </div>
            </div>
            <div>
              {accountInfo.hasGoogleAccount ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startUnlinkProcess("google")}
                  disabled={isProcessing}
                >
                  <Unlink className="w-4 h-4 mr-2" />
                  {t("unlink")}
                </Button>
              ) : (
                <Button
                  onClick={() => startLinkProcess("google")}
                  disabled={isProcessing}
                >
                  <LinkIcon className="w-4 h-4 mr-2" />
                  {t("linkAccount")}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Password Prompt Modal */}
      {showPasswordPrompt && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              {t("verifyIdentity")}
            </CardTitle>
            <CardDescription>
              {linkingProvider
                ? t("enterPasswordToLink", { provider: linkingProvider })
                : t("enterPasswordToUnlink", {
                    provider: unlinkingProvider || "",
                  })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="password">{t("currentPassword")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("enterCurrentPasswordPlaceholder")}
                disabled={isProcessing}
              />
            </div>

            {result && (
              <Alert
                className={
                  result.success
                    ? "border-green-200 bg-green-50"
                    : "border-red-200 bg-red-50"
                }
              >
                {result.success ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <AlertDescription>{result.message}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-3">
              {linkingProvider && (
                <Button
                  onClick={() => handleLinkAccount(linkingProvider)}
                  disabled={isProcessing || !password.trim()}
                  className="flex-1"
                >
                  {isLinking && (
                    <LoadingSpinner size="sm" color="white" className="mr-2" />
                  )}
                  {t("linkAccount")}
                </Button>
              )}
              {unlinkingProvider && (
                <Button
                  onClick={() => handleUnlinkAccount(unlinkingProvider)}
                  disabled={isProcessing || !password.trim()}
                  variant="destructive"
                  className="flex-1"
                >
                  {isUnlinking && (
                    <LoadingSpinner size="sm" color="white" className="mr-2" />
                  )}
                  {t("unlinkAccount")}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={cancelProcess}
                disabled={isProcessing}
              >
                {tCommon("cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
