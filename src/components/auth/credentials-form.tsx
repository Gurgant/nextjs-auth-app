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
        redirect: false,
      });

      if (result?.error) {
        setError(t("invalidCredentials"));
      } else {
        router.push(`/${locale}/dashboard`);
        router.refresh();
      }
    } catch (_error) {
      // eslint-disable-line @typescript-eslint/no-unused-vars
      setError(t("genericError"));
    } finally {
      setLoading(false);
    }
  };

  // Form validation: disable submit when fields are empty
  const isFormValid = email.trim().length > 0 && password.trim().length > 0;
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
      </div>

      {error && <AlertMessage type="error" message={error} />}

      <GradientButton
        type="submit"
        variant="blue"
        fullWidth
        loading={loading}
        disabled={isSubmitDisabled}
        loadingText={t("signingIn")}
      >
        {t("signInButton")}
      </GradientButton>
    </form>
  );
}
