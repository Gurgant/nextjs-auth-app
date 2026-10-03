/**
 * TwoFactorSetup hands setupTwoFactorAuth the locale of the page, so the
 * action answers in the user's language. The Server Actions are replaced by
 * mocks; useTranslations (mocked in jest.setup.js) returns the message key.
 */
import { render, screen, fireEvent } from "@testing-library/react";

const mockSetupTwoFactorAuth = jest.fn();
jest.mock("@/lib/actions/advanced-auth", () => ({
  setupTwoFactorAuth: (...args: unknown[]) => mockSetupTwoFactorAuth(...args),
  enableTwoFactorAuth: jest.fn(),
}));

import { TwoFactorSetup } from "../two-factor-setup";

describe("TwoFactorSetup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("starts the set-up with the locale of the page", async () => {
    const answer = "Die Zwei-Faktor-Authentifizierung ist bereits aktiviert";
    mockSetupTwoFactorAuth.mockResolvedValue({
      success: false,
      message: answer,
    });

    render(
      <TwoFactorSetup
        user={{ id: "user-1", email: "alice@example.com" }}
        locale="de"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "startSetup" }));

    // The answer of the action is shown as it came.
    expect(await screen.findByText(answer)).toBeInTheDocument();
    expect(mockSetupTwoFactorAuth.mock.calls).toEqual([["user-1", "de"]]);
  });
});
