/**
 * The signed-out home marks the sign-in option used last in this browser —
 * only in the two-option chooser, i.e. when Google sign-in is configured.
 */

import { render, screen } from "@testing-library/react";
import HomePage from "../page";
import { useGoogleSignInEnabled } from "@/hooks/use-google-sign-in";
import { LAST_LOGIN_METHOD_COOKIE } from "@/lib/auth/last-login-method";

jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock("@/hooks/use-google-sign-in", () => ({
  useGoogleSignInEnabled: jest.fn(),
}));
jest.mock("@/components/auth/credentials-form", () => ({
  CredentialsForm: () => <form data-testid="credentials-form" />,
}));

const mockGoogleEnabled = useGoogleSignInEnabled as jest.Mock;

function setCookie(value: string | null) {
  document.cookie =
    value === null
      ? `${LAST_LOGIN_METHOD_COOKIE}=; path=/; max-age=0`
      : `${LAST_LOGIN_METHOD_COOKIE}=${value}; path=/`;
}

const badges = () => screen.queryAllByTestId(/^last-used-/);

// The page logs its session timing under NODE_ENV=test.
beforeEach(() => jest.spyOn(console, "log").mockImplementation(() => {}));

afterEach(() => {
  setCookie(null);
  jest.restoreAllMocks();
});

describe("with Google configured (two options)", () => {
  beforeEach(() => mockGoogleEnabled.mockReturnValue(true));

  it("marks the e-mail option after a credentials sign-in", () => {
    setCookie("credentials");

    render(<HomePage />);

    expect(screen.getByTestId("sign-in-with-google-button")).toBeTruthy();
    expect(badges()).toHaveLength(1);
    expect(screen.getByTestId("last-used-credentials").textContent).toBe(
      "lastUsed",
    );
  });

  it("marks the Google option after a Google sign-in", () => {
    setCookie("google");

    render(<HomePage />);

    expect(badges()).toHaveLength(1);
    expect(screen.getByTestId("last-used-google")).toBeTruthy();
  });

  it("marks nothing without the cookie", () => {
    render(<HomePage />);

    expect(screen.getByTestId("sign-in-with-email-toggle")).toBeTruthy();
    expect(badges()).toHaveLength(0);
  });

  it("marks nothing for an unknown value", () => {
    setCookie("github");

    render(<HomePage />);

    expect(badges()).toHaveLength(0);
  });
});

describe("without Google (only the e-mail form)", () => {
  it("shows no badge even with the cookie", () => {
    mockGoogleEnabled.mockReturnValue(false);
    setCookie("credentials");

    render(<HomePage />);

    expect(screen.getByTestId("credentials-form")).toBeTruthy();
    expect(badges()).toHaveLength(0);
  });
});
