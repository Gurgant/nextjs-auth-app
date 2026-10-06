/**
 * The line under the title of the signed-out home says how one can sign in.
 * "Sign in with Google, or with e-mail and password" is true only where
 * Google is configured, so the page chooses the sentence by what
 * useGoogleSignInEnabled() answers. Under the layout that answer is there at
 * the first render (see home-first-html.test.tsx); the hook has no answer
 * only where no provider is above the page, and the line is empty then.
 * useTranslations (mocked in jest.setup.js) returns the message key.
 */

import { render, screen } from "@testing-library/react";
import HomePage from "../page";
import { useGoogleSignInEnabled } from "@/hooks/use-google-sign-in";

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

const WITH_GOOGLE = "subtitle";
const WITHOUT_GOOGLE = "subtitleWithoutGoogle";

const subtitle = () => screen.getByTestId("home-subtitle");

// The page logs its session timing under NODE_ENV=test.
beforeEach(() => jest.spyOn(console, "log").mockImplementation(() => {}));

afterEach(() => jest.restoreAllMocks());

it("shows the sentence that names Google, and the Google button, where the answer is true", () => {
  mockGoogleEnabled.mockReturnValue(true);

  render(<HomePage />);

  expect(screen.getByTestId("sign-in-with-google-button")).toBeTruthy();
  expect(subtitle().textContent).toBe(WITH_GOOGLE);
});

it("shows the sentence without Google, the e-mail form and no chooser where the answer is false", () => {
  mockGoogleEnabled.mockReturnValue(false);

  render(<HomePage />);

  expect(screen.queryByTestId("sign-in-with-google-button")).toBeNull();
  expect(screen.queryByTestId("sign-in-with-email-toggle")).toBeNull();
  expect(screen.getByTestId("credentials-form")).toBeTruthy();
  expect(subtitle().textContent).toBe(WITHOUT_GOOGLE);
});

it("shows neither sentence while there is no answer", () => {
  mockGoogleEnabled.mockReturnValue(null);

  render(<HomePage />);

  expect(subtitle().textContent).toBe("");
  expect(screen.queryByText(WITH_GOOGLE)).toBeNull();
  expect(screen.queryByText(WITHOUT_GOOGLE)).toBeNull();
});

it("shows the sentence of the answer once the answer is there", () => {
  mockGoogleEnabled.mockReturnValue(null);
  const { rerender } = render(<HomePage />);

  mockGoogleEnabled.mockReturnValue(false);
  rerender(<HomePage />);

  expect(subtitle().textContent).toBe(WITHOUT_GOOGLE);
});

it("marks the signed-out page with the session status, for whoever has to know that React is attached", () => {
  mockGoogleEnabled.mockReturnValue(false);

  render(<HomePage />);

  // jest.setup.js answers useSession() with "unauthenticated".
  expect(screen.getByTestId("signed-out-home")).toHaveAttribute(
    "data-session-status",
    "unauthenticated",
  );
});
