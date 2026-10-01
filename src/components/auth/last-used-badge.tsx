"use client";

import { useTranslations } from "next-intl";
import type { LoginMethod } from "@/lib/auth/last-login-method";

/**
 * "Last used" marker for a sign-in option. Place it inside a `relative`
 * wrapper around the option: it sits on the top-right corner.
 */
export function LastUsedBadge({ method }: { method: LoginMethod }) {
  const t = useTranslations("Auth");

  return (
    <span
      className="pointer-events-none absolute -top-2 right-3 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full border border-green-200"
      data-testid={`last-used-${method}`}
    >
      {t("lastUsed")}
    </span>
  );
}
