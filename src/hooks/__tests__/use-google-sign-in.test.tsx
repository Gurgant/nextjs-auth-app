/**
 * useGoogleSignInEnabled() says whether the server offers Google sign-in.
 * Under the layout the answer comes with the page: GoogleSignInProvider hands
 * on what the server knows, the hook answers at its first render and sends no
 * request. Without a provider above it (a component rendered on its own) the
 * hook asks /api/auth/providers, once for every component that asks, and
 * answers null until the answer is there.
 *
 * The hook keeps its request for the life of the module, so the tests of the
 * request run in this order: a request that fails, then one that is answered.
 */
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";

const mockGetProviders = jest.fn();
jest.mock("next-auth/react", () => ({
  getProviders: () => mockGetProviders(),
}));

import { GoogleSignInProvider } from "@/components/auth/google-sign-in-provider";
import { useGoogleSignInEnabled } from "../use-google-sign-in";

const under = (enabled: boolean) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <GoogleSignInProvider enabled={enabled}>{children}</GoogleSignInProvider>
    );
  };

beforeEach(() => {
  mockGetProviders.mockReset();
});

describe("under the provider of the layout", () => {
  it.each([true, false])(
    "answers %s at the first render and sends no request",
    async (enabled) => {
      const answers: (boolean | null)[] = [];

      const { result } = renderHook(
        () => {
          const answer = useGoogleSignInEnabled();
          answers.push(answer);
          return answer;
        },
        { wrapper: under(enabled) },
      );
      // Effects have run by now: a request would have been sent.
      await Promise.resolve();

      expect(result.current).toBe(enabled);
      expect(answers.every((answer) => answer === enabled)).toBe(true);
      expect(answers.length).toBeGreaterThan(0);
      expect(mockGetProviders).not.toHaveBeenCalled();
    },
  );
});

describe("without a provider above it", () => {
  it("answers null, asks the provider list, and answers false when the request fails", async () => {
    mockGetProviders.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useGoogleSignInEnabled());

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(false));
    expect(mockGetProviders).toHaveBeenCalledTimes(1);
  });

  it("asks again at the next mount after a failed request, and answers true when Google is in the list", async () => {
    mockGetProviders.mockResolvedValue({ google: {}, credentials: {} });

    const { result } = renderHook(() => useGoogleSignInEnabled());

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(true));
    expect(mockGetProviders).toHaveBeenCalledTimes(1);
  });

  it("shares the answered request: a later mount gets the answer and sends none", async () => {
    const { result } = renderHook(() => useGoogleSignInEnabled());

    await waitFor(() => expect(result.current).toBe(true));
    expect(mockGetProviders).not.toHaveBeenCalled();
  });
});
