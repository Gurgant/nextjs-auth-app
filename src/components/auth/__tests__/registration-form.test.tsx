/**
 * RegistrationForm leaves for the home page of its locale two seconds after a
 * successful sign-up. The address carries nothing else: no page reads a
 * parameter from it. The Server Action is replaced by a mock; useTranslations
 * (mocked in jest.setup.js) returns the message key.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";

const mockRegisterUser = jest.fn();
jest.mock("@/lib/actions/auth", () => ({
  registerUser: (...args: unknown[]) => mockRegisterUser(...args),
}));

// jest.setup.js hands out a new router on every call: this one can be watched.
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { RegistrationForm } from "../registration-form";

describe("RegistrationForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Ticks the terms, sends the form and lets the action answer. */
  async function signUp() {
    const { container } = render(<RegistrationForm locale="de" />);
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });
  }

  it("goes to the home page of its locale two seconds after a sign-up, with no query string", async () => {
    mockRegisterUser.mockResolvedValue({ success: true, message: "Created" });

    await signUp();

    expect(mockRegisterUser).toHaveBeenCalledTimes(1);

    // One millisecond short of the two seconds: still on the page.
    act(() => {
      jest.advanceTimersByTime(1999);
    });
    expect(mockPush).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(mockPush.mock.calls).toEqual([["/de"]]);
  });

  it("stays on the page when the sign-up is refused", async () => {
    mockRegisterUser.mockResolvedValue({
      success: false,
      message: "User already exists",
    });

    await signUp();
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // The form was sent, so the page had its chance to leave.
    expect(mockRegisterUser).toHaveBeenCalledTimes(1);
    expect(screen.getByText("User already exists")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
