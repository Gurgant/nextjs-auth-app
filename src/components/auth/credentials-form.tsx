"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { GradientButton } from "@/components/ui/gradient-button";
import { AlertMessage } from "@/components/ui/alert-message";
import { InputWithIcon } from "@/components/ui/input-with-icon";
import { useSafeLocale } from "@/hooks/use-safe-locale";

export function CredentialsForm() {
  const router = useRouter();
  const t = useTranslations("CredentialsForm");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [requires2FA, setRequires2FA] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Use safe locale extraction
  const locale = useSafeLocale();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        ...(requires2FA ? { totpCode } : {}),
        redirect: false,
      });

      const res = result as
        | { error?: string; code?: string }
        | null
        | undefined;

      if (res?.error) {
        if (res.code === "2fa_required") {
          // Second stage: password was correct, ask for the authenticator code.
          setRequires2FA(true);
          setError("");
        } else if (res.code === "2fa_invalid") {
          setRequires2FA(true);
          setError("Invalid or expired code. Please try again.");
        } else {
          setError(t("invalidCredentials"));
        }
      } else {
        router.push(`/${locale}/account`);
        router.refresh();
      }
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(false);
    }
  };

  // Form validation: disable submit when required fields are empty
  const isFormValid =
    email.trim().length > 0 &&
    password.trim().length > 0 &&
    (!requires2FA || totpCode.trim().length === 6);
  const isSubmitDisabled = !isFormValid || loading;

  return (
    <form onSubmit={handleSubmit} className="space-y-5 w-full">
      <div className="space-y-4">
        <InputWithIcon
          icon="mail"
          type="email"
          id="email"
          label={t("emailLabel")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder={t("emailPlaceholder")}
          focusRing="blue"
        />

        <InputWithIcon
          icon="lock"
          type="password"
          id="password"
          label={t("passwordLabel")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder={t("passwordPlaceholder")}
          focusRing="blue"
          showPasswordToggle
        />

        {requires2FA && (
          <InputWithIcon
            icon="lock"
            type="text"
            id="totpCode"
            label="Two-factor code"
            value={totpCode}
            onChange={(e) =>
              setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            required
            placeholder="000000"
            focusRing="blue"
          />
        )}
      </div>

      {requires2FA && !error && (
        <p className="text-sm text-blue-700">
          Enter the 6-digit code from your authenticator app to finish signing
          in.
        </p>
      )}
      {error && <AlertMessage type="error" message={error} />}

      <GradientButton
        type="submit"
        variant="blue"
        fullWidth
        loading={loading}
        disabled={isSubmitDisabled}
        loadingText={t("signingIn")}
      >
        {requires2FA ? "Verify code" : t("signInButton")}
      </GradientButton>
    </form>
  );
}
