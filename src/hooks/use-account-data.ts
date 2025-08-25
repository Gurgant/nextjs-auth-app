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
      // Use the optimized API endpoint with caching
      const response = await fetch("/api/account/info-optimized", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        // Enable client-side caching
        cache: "force-cache",
      });

      const result = await response.json();

      if (result.success && result.data) {
        setAccountInfo(result.data);
        console.log(
          `✅ Account info loaded ${result.cached ? "(cached)" : "(fresh)"}`,
        );
      } else {
        const errorMessage =
          result.message || tErrors("failedToLoadAccountInfo");
        setError(errorMessage);
        console.error(`❌ Error loading account info:`, errorMessage);

        // Use fallback data if available
        if (result.data) {
          setAccountInfo(result.data);
        } else {
          setAccountInfo({
            hasGoogleAccount: false,
            hasPassword: false,
            hasEmailAccount: false,
            emailVerified: null,
            twoFactorEnabled: false,
          });
        }
      }
    } catch (error) {
      const errorMessage = tErrors("failedToLoadAccountInfo");
      setError(errorMessage);
      console.error(`❌ Network error during account info loading:`, error);

      // Set fallback account info to prevent UI breaks
      setAccountInfo({
        hasGoogleAccount: false,
        hasPassword: false,
        hasEmailAccount: false,
        emailVerified: null,
        twoFactorEnabled: false,
      });
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
