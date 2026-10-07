"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerUser } from "@/lib/actions/auth";
import { isErrorResponse, getFieldError } from "@/lib/utils/form-responses";
import { useLocalizedAction } from "@/hooks/use-localized-action";
import { useFormReset } from "@/hooks/use-form-reset";
import { GradientButton } from "@/components/ui/gradient-button";
import { AlertMessage } from "@/components/ui/alert-message";
import { InputWithIcon } from "@/components/ui/input-with-icon";
import { type Locale } from "@/config/i18n";

interface RegistrationFormProps {
  locale: Locale;
}

// The two links of the terms sentence: underlined, so that they are told
// from the text around them by more than their colour.
const LEGAL_LINK_CLASS =
  "font-medium text-green-700 underline underline-offset-2 hover:text-green-800 transition-colors duration-200";

// The element that says what both links do: they open a new tab.
const LEGAL_LINKS_HINT_ID = "terms-links-hint";

export function RegistrationForm({ locale }: RegistrationFormProps) {
  const t = useTranslations("Registration");
  const tAuth = useTranslations("Auth");
  const router = useRouter();

  const [agreed, setAgreed] = useState(false);

  // Use our custom hooks for form state management
  const { isLoading, result, execute } = useLocalizedAction(
    registerUser,
    locale,
    {
      onSuccess: () => {
        // Go to the home page two seconds after a successful registration
        setTimeout(() => {
          router.push(`/${locale}`);
        }, 2000);
      },
      resetDelay: 5000, // Auto-clear messages after 5 seconds
    },
  );

  const { formRef, resetForm } = useFormReset({
    formName: "RegistrationForm",
    onReset: () => setAgreed(false),
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const result = await execute(formData);

    // Reset form on successful registration
    if (result.success) {
      resetForm();
    }
  };

  return (
    <>
      {/* Hero Section */}
      <div className="text-center space-y-6 mb-8">
        <div className="space-y-4">
          <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg transform rotate-3 hover:rotate-0 transition-transform duration-300">
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
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
              {t("title")}
            </h1>
            <p className="text-gray-600 text-lg">{t("subtitle")}</p>
          </div>
        </div>
      </div>

      {/* Registration Form */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
          {/* Full Name */}
          <InputWithIcon
            icon="user"
            type="text"
            id="name"
            name="name"
            label={t("fullName")}
            required
            placeholder={t("namePlaceholder")}
            focusRing="green"
            error={
              result && isErrorResponse(result)
                ? getFieldError(result, "name")
                : undefined
            }
          />

          {/* Email */}
          <InputWithIcon
            icon="mail"
            type="email"
            id="email"
            name="email"
            label={t("emailAddress")}
            required
            placeholder={t("emailPlaceholder")}
            focusRing="green"
            error={
              result && isErrorResponse(result)
                ? getFieldError(result, "email")
                : undefined
            }
          />

          {/* Password */}
          <InputWithIcon
            icon="lock"
            type="password"
            id="password"
            name="password"
            label={t("createPassword")}
            required
            minLength={8}
            placeholder={t("passwordPlaceholder")}
            focusRing="green"
            showPasswordToggle
            error={
              result && isErrorResponse(result)
                ? getFieldError(result, "password")
                : undefined
            }
          />

          {/* Confirm Password */}
          <InputWithIcon
            icon="shield"
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            label={t("confirmPassword")}
            required
            minLength={8}
            placeholder={t("confirmPasswordPlaceholder")}
            focusRing="green"
            showPasswordToggle
            error={
              result && isErrorResponse(result)
                ? getFieldError(result, "confirmPassword")
                : undefined
            }
          />

          {/* Terms Agreement. The sentence names two documents, and each
              name is a link to the page of that document (two placeholder
              pages of the kit). A link opens a new tab, so the form keeps
              what was typed. It stands inside the label: a click on a link
              in a label is not passed on to the label's control, and the
              name of the checkbox is the text of the whole sentence. That
              a link opens a new tab is said in its description, from an
              element outside the label that is not shown: text inside a
              link would become part of the checkbox's name. */}
          <div className="flex items-start">
            <div className="flex items-center h-5">
              <input
                id="terms"
                name="terms"
                type="checkbox"
                required
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="focus:ring-green-500 h-4 w-4 text-green-600 border-gray-300 rounded"
              />
            </div>
            <div className="ml-3 text-sm">
              <label htmlFor="terms" className="text-gray-600">
                {t.rich("agreeToTerms", {
                  terms: (name) => (
                    <Link
                      href={`/${locale}/terms`}
                      target="_blank"
                      rel="noopener noreferrer"
                      prefetch={false}
                      aria-describedby={LEGAL_LINKS_HINT_ID}
                      className={LEGAL_LINK_CLASS}
                    >
                      {name}
                    </Link>
                  ),
                  privacy: (name) => (
                    <Link
                      href={`/${locale}/privacy`}
                      target="_blank"
                      rel="noopener noreferrer"
                      prefetch={false}
                      aria-describedby={LEGAL_LINKS_HINT_ID}
                      className={LEGAL_LINK_CLASS}
                    >
                      {name}
                    </Link>
                  ),
                })}
              </label>
              <span id={LEGAL_LINKS_HINT_ID} hidden>
                {t("opensInNewTab")}
              </span>
            </div>
          </div>

          {/* Success/Error Messages */}
          {result?.message && (
            <AlertMessage
              type={result.success ? "success" : "error"}
              message={result.message}
            />
          )}

          {/* Submit Button */}
          <GradientButton
            type="submit"
            variant="green"
            fullWidth
            disabled={!agreed || isLoading}
            loading={isLoading}
            loadingText={t("creating")}
          >
            {t("createAccount")}
          </GradientButton>
        </form>

        {/* Sign In Link */}
        <div className="mt-6 text-center">
          <p className="text-gray-600 text-sm">
            {tAuth("alreadyHaveAccount")}{" "}
            <Link
              href={`/${locale}`}
              className="font-medium text-blue-600 hover:text-blue-700 transition-colors duration-200"
            >
              {tAuth("signInHere")}
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
