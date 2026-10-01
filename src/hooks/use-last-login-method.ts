"use client";

import { useEffect, useState } from "react";
import {
  readLastLoginMethod,
  type LoginMethod,
} from "@/lib/auth/last-login-method";

/**
 * The sign-in method last used in this browser, from the cookie the server
 * sets on a successful sign-in. Null until mounted (the cookie is not
 * available while rendering on the server) and when there is no cookie.
 */
export function useLastLoginMethod(): LoginMethod | null {
  const [method, setMethod] = useState<LoginMethod | null>(null);

  useEffect(() => {
    setMethod(readLastLoginMethod(document.cookie));
  }, []);

  return method;
}
