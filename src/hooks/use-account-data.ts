"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";

interface AccountData {
  hasGoogleAccount: boolean;
  hasPassword: boolean;
  hasEmailAccount: boolean;
  emailVerified: boolean | null;
  twoFactorEnabled: boolean;
  primaryAuthMethod?: string;
  createdAt?: string;
  passwordSetAt?: string;
  backupCodesCount?: number;
}

interface UseAccountDataReturn {
  accountInfo: AccountData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAccountData(userId?: string): UseAccountDataReturn {
  const [accountInfo, setAccountInfo] = useState<AccountData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tErrors = useTranslations("ComponentErrors");

  const fetchAccountInfo = useCallback(async () => {
    if (!userId) {
      console.warn(`⚠️ User ID not available`);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/account/info", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        // Always fresh: the page refetches right after security changes.
        cache: "no-store",
      });

      const result = await response.json();

      if (result.success && result.data) {
        setAccountInfo(result.data);
      } else {
        const errorMessage =
          result.message || tErrors("failedToLoadAccountInfo");
        setError(errorMessage);
        console.error(`❌ Error loading account info:`, errorMessage);

        // No made-up fallback: unknown is shown as an error, not as "off".
        setAccountInfo(null);
      }
    } catch (error) {
      const errorMessage = tErrors("failedToLoadAccountInfo");
      setError(errorMessage);
      console.error(`❌ Network error during account info loading:`, error);

      setAccountInfo(null);
    } finally {
      setIsLoading(false);
    }
  }, [userId, tErrors]);

  useEffect(() => {
    fetchAccountInfo();
  }, [fetchAccountInfo]);

  return {
    accountInfo,
    isLoading,
    error,
    refetch: fetchAccountInfo,
  };
}
