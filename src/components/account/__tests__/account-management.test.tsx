/**
 * AccountManagement hands disableTwoFactorAuth the locale of the page, so the
 * action answers in the user's language. The Server Actions, the account data
 * and the account-linking card are replaced by mocks; useTranslations (mocked
 * in jest.setup.js) returns the message key.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockDisableTwoFactorAuth = jest.fn();
jest.mock("@/lib/actions/advanced-auth", () => ({
  disableTwoFactorAuth: (...args: unknown[]) =>
    mockDisableTwoFactorAuth(...args),
  sendEmailVerification: jest.fn(),
  setupTwoFactorAuth: jest.fn(),
  enableTwoFactorAuth: jest.fn(),
}));

jest.mock("@/lib/actions/auth", () => ({
  updateUserProfile: jest.fn(),
  deleteUserAccount: jest.fn(),
  addPasswordToGoogleUser: jest.fn(),
  changeUserPassword: jest.fn(),
}));

// An account with two-factor authentication on: the page offers to disable it.
const mockRefetch = jest.fn();
jest.mock("@/hooks/use-account-data", () => ({
  useAccountData: () => ({
    accountInfo: {
      hasGoogleAccount: false,
      hasPassword: true,
      hasEmailAccount: true,
      emailVerified: true,
      twoFactorEnabled: true,
      backupCodesCount: 8,
    },
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  }),
}));

jest.mock("@/components/account/oauth-account-linking", () => ({
  OAuthAccountLinking: () => null,
}));

import { AccountManagement } from "../account-management";

describe("AccountManagement", () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    confirmSpy = jest.spyOn(window, "confirm");
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  const renderPage = () =>
    render(
      <AccountManagement
        user={{ id: "user-1", name: "Alice", email: "alice@example.com" }}
        locale="de"
      />,
    );

  it("disables two-factor authentication with the locale of the page", async () => {
    confirmSpy.mockReturnValue(true);
    mockDisableTwoFactorAuth.mockResolvedValue({
      success: true,
      message: "Deaktiviert",
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "disableTwoFactor" }));

    // The account data is read again once the action has answered.
    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
    expect(mockDisableTwoFactorAuth.mock.calls).toEqual([["user-1", "de"]]);
  });

  it("does not call the action when the user does not confirm", () => {
    confirmSpy.mockReturnValue(false);

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "disableTwoFactor" }));

    expect(confirmSpy).toHaveBeenCalledWith("disableTwoFactorConfirm");
    expect(mockDisableTwoFactorAuth).not.toHaveBeenCalled();
  });
});
