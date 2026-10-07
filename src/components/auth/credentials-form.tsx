"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { GradientButton } from "@/components/ui/gradient-button";
import { AlertMessage } from "@/components/ui/alert-message";
import { InputWithIcon } from "@/components/ui/input-with-icon";
import { useSafeLocale } from "@/hooks/use-safe-locale";

// A backup code is eight letters and digits (generateBackupCodes in
// src/lib/security.ts); the file the user downloaded writes it XXXX-XXXX.
const BACKUP_CODE_LENGTH = 8;

/**
 * A backup code as the downloaded file writes it, from what a person types:
 * the letters and digits in capitals, a hyphen after the fourth. Lower case,
 * spaces and a hyphen in another place make no difference (the server
 * compares without them as well: validateBackupCode in src/lib/two-factor.ts).
 */
function formatBackupCode(typed: string): string {
  const characters = typed
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, BACKUP_CODE_LENGTH);
  return characters.length > 4
    ? `${characters.slice(0, 4)}-${characters.slice(4)}`
    : characters;
}

export function CredentialsForm() {
  const router = useRouter();
  const t = useTranslations("CredentialsForm");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  // The second step takes one of two codes: the six digits of the
  // authenticator app, or one of the backup codes of a user who has lost it.
  const [codeKind, setCodeKind] = useState<"totp" | "backup">("totp");
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
      // One code at a time: authorize() (src/lib/auth-config.ts) reads
      // `totpCode` and `backupCode`, and removes a backup code it accepts.
      const secondFactor =
        codeKind === "backup" ? { backupCode } : { totpCode };
      const result = await signIn("credentials", {
        email,
        password,
        ...(requires2FA ? secondFactor : {}),
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
          // The server gives one answer for a wrong code of either kind.
          setRequires2FA(true);
          setError(t("invalidTwoFactorCode"));
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

  // From one kind of code to the other: what was typed of the first is not
  // kept, and neither is the answer to it.
  const switchCodeKind = (kind: "totp" | "backup") => {
    setCodeKind(kind);
    setTotpCode("");
    setBackupCode("");
    setError("");
  };

  // Form validation: disable submit when required fields are empty
  const isCodeComplete =
    codeKind === "backup"
      ? backupCode.length === BACKUP_CODE_LENGTH + 1
      : totpCode.trim().length === 6;
  const isFormValid =
    email.trim().length > 0 &&
    password.trim().length > 0 &&
    (!requires2FA || isCodeComplete);
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

        {requires2FA && codeKind === "totp" && (
          <InputWithIcon
            icon="lock"
            type="text"
            id="totpCode"
            label={t("twoFactorCodeLabel")}
            value={totpCode}
            onChange={(e) =>
              setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            required
            placeholder="000000"
            focusRing="blue"
          />
        )}

        {requires2FA && codeKind === "backup" && (
          <InputWithIcon
            icon="key"
            type="text"
            id="backupCode"
            label={t("backupCodeLabel")}
            value={backupCode}
            onChange={(e) => setBackupCode(formatBackupCode(e.target.value))}
            required
            placeholder="XXXX-XXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            focusRing="blue"
          />
        )}

        {requires2FA && (
          <button
            type="button"
            onClick={() =>
              switchCodeKind(codeKind === "totp" ? "backup" : "totp")
            }
            className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors duration-200"
            data-testid="switch-second-factor"
          >
            {codeKind === "totp"
              ? t("useBackupCode")
              : t("useAuthenticatorCode")}
          </button>
        )}
      </div>

      {requires2FA && !error && (
        <p className="text-sm text-blue-700">
          {codeKind === "totp" ? t("twoFactorCodeHint") : t("backupCodeHint")}
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
        {requires2FA ? t("verifyCodeButton") : t("signInButton")}
      </GradientButton>
    </form>
  );
}
