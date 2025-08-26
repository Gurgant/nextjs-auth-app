import React from "react";
import { render } from "@testing-library/react";
import { AuthGuard } from "../auth-guard";

// Mock Next.js modules
jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

// Import mocked functions
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Type the mocked functions
const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;
const mockAuth = auth as unknown as jest.MockedFunction<() => Promise<any>>;

describe("AuthGuard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("when requireAuth is true (default)", () => {
    it("renders children when user is authenticated", async () => {
      // Mock authenticated user
      mockAuth.mockResolvedValue({
        user: { id: "1", email: "test@example.com" },
        expires: "2024-12-31",
      } as any);

      const Component = await AuthGuard({
        children: <div>Protected Content</div>,
        locale: "en",
      });

      const { getByText } = render(Component as React.ReactElement);
      expect(getByText("Protected Content")).toBeInTheDocument();
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("redirects to home when user is not authenticated", async () => {
      // Mock no user
      mockAuth.mockResolvedValue(null);

      await AuthGuard({
        children: <div>Protected Content</div>,
        locale: "en",
      });

      expect(mockRedirect).toHaveBeenCalledWith("/en");
    });

    it("redirects to custom path when not authenticated", async () => {
      // Mock no user
      mockAuth.mockResolvedValue(null);

      await AuthGuard({
        children: <div>Protected Content</div>,
        locale: "en",
        redirectTo: "/en/login",
      });

      expect(mockRedirect).toHaveBeenCalledWith("/en/login");
    });

    it("uses correct locale in redirect path", async () => {
      // Mock no user
      mockAuth.mockResolvedValue(null);

      await AuthGuard({
        children: <div>Protected Content</div>,
        locale: "fr",
      });

      expect(mockRedirect).toHaveBeenCalledWith("/fr");
    });
  });

  describe("when requireAuth is false", () => {
    it("renders children when user is not authenticated", async () => {
      // Mock no user
      mockAuth.mockResolvedValue(null);

      const Component = await AuthGuard({
        children: <div>Public Content</div>,
        locale: "en",
        requireAuth: false,
      });

      const { getByText } = render(Component as React.ReactElement);
      expect(getByText("Public Content")).toBeInTheDocument();
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("redirects to account when user is authenticated", async () => {
      // Mock authenticated user
      mockAuth.mockResolvedValue({
        user: { id: "1", email: "test@example.com" },
        expires: "2024-12-31",
      } as any);

      await AuthGuard({
        children: <div>Public Content</div>,
        locale: "en",
        requireAuth: false,
      });

      expect(mockRedirect).toHaveBeenCalledWith("/en/account");
    });

    it("redirects to custom path when authenticated", async () => {
      // Mock authenticated user
      mockAuth.mockResolvedValue({
        user: { id: "1", email: "test@example.com" },
        expires: "2024-12-31",
      } as any);

      await AuthGuard({
        children: <div>Public Content</div>,
        locale: "en",
        requireAuth: false,
        redirectTo: "/en/profile",
      });

      expect(mockRedirect).toHaveBeenCalledWith("/en/profile");
    });

    it("uses correct locale in account redirect", async () => {
      // Mock authenticated user
      mockAuth.mockResolvedValue({
        user: { id: "1", email: "test@example.com" },
        expires: "2024-12-31",
      } as any);

      await AuthGuard({
        children: <div>Public Content</div>,
        locale: "de",
        requireAuth: false,
      });

      expect(mockRedirect).toHaveBeenCalledWith("/de/account");
    });
  });

  describe("edge cases", () => {
    it("handles session with user but no email", async () => {
      // Mock user without email
      mockAuth.mockResolvedValue({
        user: { id: "1" },
        expires: "2024-12-31",
      } as any);

      const Component = await AuthGuard({
        children: <div>Protected Content</div>,
        locale: "en",
      });

      const { getByText } = render(Component as React.ReactElement);
      expect(getByText("Protected Content")).toBeInTheDocument();
    });

    it("handles empty session object", async () => {
      // Mock empty session
      mockAuth.mockResolvedValue({} as any);

      await AuthGuard({
        children: <div>Protected Content</div>,
        locale: "en",
      });

      expect(mockRedirect).toHaveBeenCalledWith("/en");
    });
  });
});
