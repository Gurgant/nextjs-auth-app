import { renderHook } from "@testing-library/react";
import { useLastLoginMethod } from "../use-last-login-method";
import { LAST_LOGIN_METHOD_COOKIE } from "@/lib/auth/last-login-method";

function setCookie(value: string | null) {
  document.cookie =
    value === null
      ? `${LAST_LOGIN_METHOD_COOKIE}=; path=/; max-age=0`
      : `${LAST_LOGIN_METHOD_COOKIE}=${value}; path=/`;
}

afterEach(() => setCookie(null));

it("returns the method stored in the cookie", () => {
  setCookie("google");

  const { result } = renderHook(() => useLastLoginMethod());

  expect(result.current).toBe("google");
});

it("returns null without the cookie", () => {
  const { result } = renderHook(() => useLastLoginMethod());

  expect(result.current).toBeNull();
});

it("returns null when the cookie holds an unknown value", () => {
  setCookie("github");

  const { result } = renderHook(() => useLastLoginMethod());

  expect(result.current).toBeNull();
});
