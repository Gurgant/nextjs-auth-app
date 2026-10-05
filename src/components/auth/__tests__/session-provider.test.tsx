/**
 * AuthSessionProvider hands next-auth's SessionProvider one set of settings,
 * whatever the environment. It once had a second set for NODE_ENV "test",
 * described as being for the E2E tests: a refetch every second and two props
 * that SessionProvider does not have. No browser ever got it. Read in the
 * source of next 15.5.26 (dist/build/define-env.js) and not measured: the
 * code that Next compiles has `process.env.NODE_ENV` replaced by
 * "development" under `next dev` and by "production" in a build, whatever the
 * variable is set to. Measured here: Jest runs with NODE_ENV "test", and it
 * was the only place where the second set applied.
 */
import { render, screen } from "@testing-library/react";

const mockSessionProvider = jest.fn();
jest.mock("next-auth/react", () => ({
  SessionProvider: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [prop: string]: unknown;
  }) => {
    mockSessionProvider(props);
    return <>{children}</>;
  },
}));

import { AuthSessionProvider } from "../session-provider";

describe("AuthSessionProvider", () => {
  const env = process.env as Record<string, string>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(["test", "development", "production"])(
    "gives SessionProvider the same settings under NODE_ENV=%s",
    (nodeEnv) => {
      jest.replaceProperty(env, "NODE_ENV", nodeEnv);

      render(
        <AuthSessionProvider>
          <p>page</p>
        </AuthSessionProvider>,
      );

      expect(screen.getByText("page")).toBeInTheDocument();
      expect(mockSessionProvider.mock.calls).toEqual([
        [
          {
            basePath: "/api/auth",
            refetchInterval: 300,
            refetchOnWindowFocus: true,
            refetchWhenOffline: false,
          },
        ],
      ]);
    },
  );

  it("runs under NODE_ENV=test in Jest, where the other settings used to apply", () => {
    expect(process.env.NODE_ENV).toBe("test");
  });
});
