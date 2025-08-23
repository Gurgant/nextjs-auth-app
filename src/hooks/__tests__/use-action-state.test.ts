import { renderHook, act, waitFor } from "@testing-library/react";
import { useActionState, useLocalizedAction } from "../use-action-state";
import type { ActionResponse } from "@/lib/utils/form-responses";

// Mock action that returns success
const mockSuccessAction = jest.fn().mockResolvedValue({
  success: true,
  message: "Success!",
  data: { id: 123 },
} as ActionResponse);

// Mock action that returns error
const mockErrorAction = jest.fn().mockResolvedValue({
  success: false,
  message: "Error occurred",
} as ActionResponse);

// Mock action that throws
const mockThrowingAction = jest
  .fn()
  .mockRejectedValue(new Error("Network error"));

describe("useActionState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  describe("basic functionality", () => {
    it("initializes with correct default state", () => {
      const { result } = renderHook(() => useActionState(mockSuccessAction));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.result).toBeNull();
    });

    it("manages loading state during execution", async () => {
      const { result } = renderHook(() => useActionState(mockSuccessAction));

      // Start execution
      let executePromise: Promise<ActionResponse>;
      act(() => {
        executePromise = result.current.execute("arg1", "arg2");
      });

      // Should be loading
      expect(result.current.isLoading).toBe(true);
      expect(result.current.result).toBeNull();

      // Wait for completion
      await act(async () => {
        await executePromise;
      });

      // Should no longer be loading
      expect(result.current.isLoading).toBe(false);
      expect(result.current.result).toEqual({
        success: true,
        message: "Success!",
        data: { id: 123 },
      });

      // Action should have been called with correct args
      expect(mockSuccessAction).toHaveBeenCalledWith("arg1", "arg2");
    });

    it("handles error responses correctly", async () => {
      const { result } = renderHook(() => useActionState(mockErrorAction));

      await act(async () => {
        await result.current.execute();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.result).toEqual({
        success: false,
        message: "Error occurred",
      });
    });

    it("handles thrown errors gracefully", async () => {
      const { result } = renderHook(() => useActionState(mockThrowingAction));

      await act(async () => {
        await result.current.execute();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.result).toEqual({
        success: false,
        message: "Network error",
      });
    });
  });

  describe("callbacks", () => {
    it("calls onSuccess callback for successful actions", async () => {
      const onSuccess = jest.fn();
      const { result } = renderHook(() =>
        useActionState(mockSuccessAction, { onSuccess }),
      );

      await act(async () => {
        await result.current.execute();
      });

      expect(onSuccess).toHaveBeenCalledWith({ id: 123 });
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it("calls onError callback for failed actions", async () => {
      const onError = jest.fn();
      const { result } = renderHook(() =>
        useActionState(mockErrorAction, { onError }),
      );

      await act(async () => {
        await result.current.execute();
      });

      expect(onError).toHaveBeenCalledWith({
        success: false,
        message: "Error occurred",
      });
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it("handles async callbacks", async () => {
      jest.useRealTimers(); // Use real timers for this test

      const onSuccess = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const { result } = renderHook(() =>
        useActionState(mockSuccessAction, { onSuccess }),
      );

      await act(async () => {
        await result.current.execute();
      });

      expect(onSuccess).toHaveBeenCalled();

      jest.useFakeTimers(); // Restore fake timers
    });
  });

  describe("auto-reset functionality", () => {
    it("auto-resets after specified delay", async () => {
      const { result } = renderHook(() =>
        useActionState(mockSuccessAction, { resetDelay: 1000 }),
      );

      await act(async () => {
        await result.current.execute();
      });

      expect(result.current.result).not.toBeNull();

      // Advance timers
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(result.current.result).toBeNull();
    });

    it("respects resetOnSuccessOnly option", async () => {
      const { result } = renderHook(() =>
        useActionState(mockErrorAction, {
          resetDelay: 1000,
          resetOnSuccessOnly: true,
        }),
      );

      await act(async () => {
        await result.current.execute();
      });

      expect(result.current.result).not.toBeNull();

      // Advance timers
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Should not reset on error when resetOnSuccessOnly is true
      expect(result.current.result).not.toBeNull();
    });

    it("cancels auto-reset on new execution", async () => {
      const { result } = renderHook(() =>
        useActionState(mockSuccessAction, { resetDelay: 1000 }),
      );

      // First execution
      await act(async () => {
        await result.current.execute();
      });

      // Advance timer partially
      act(() => {
        jest.advanceTimersByTime(500);
      });

      // Second execution should cancel first reset
      await act(async () => {
        await result.current.execute();
      });

      // Complete first timer duration
      act(() => {
        jest.advanceTimersByTime(500);
      });

      // Result should still be present (from second execution)
      expect(result.current.result).not.toBeNull();
    });
  });

  describe("manual controls", () => {
    it("reset clears the result", async () => {
      const { result } = renderHook(() => useActionState(mockSuccessAction));

      await act(async () => {
        await result.current.execute();
      });

      expect(result.current.result).not.toBeNull();

      act(() => {
        result.current.reset();
      });

      expect(result.current.result).toBeNull();
    });

    it("setResult updates the result manually", () => {
      const { result } = renderHook(() => useActionState(mockSuccessAction));

      const customResult: ActionResponse = {
        success: true,
        message: "Custom result",
      };

      act(() => {
        result.current.setResult(customResult);
      });

      expect(result.current.result).toEqual(customResult);
    });
  });

  describe("cleanup", () => {
    it("clears timeouts on unmount", async () => {
      const { result, unmount } = renderHook(() =>
        useActionState(mockSuccessAction, { resetDelay: 1000 }),
      );

      await act(async () => {
        await result.current.execute();
      });

      // Unmount before timer completes
      unmount();

      // Advance timers - should not cause issues
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // No assertion needed - test passes if no errors occur
    });
  });
});

describe("useLocalizedAction", () => {
  it("adds locale to FormData if not present", async () => {
    const mockAction = jest.fn().mockResolvedValue({
      success: true,
      message: "Success!",
    } as ActionResponse);

    const { result } = renderHook(() => useLocalizedAction(mockAction, "es"));

    const formData = new FormData();
    formData.append("name", "Test");

    await act(async () => {
      await result.current.execute(formData);
    });

    // Check that locale was added
    const calledFormData = mockAction.mock.calls[0][0];
    expect(calledFormData.get("_locale")).toBe("es");
    expect(calledFormData.get("name")).toBe("Test");
  });

  it("preserves existing locale in FormData", async () => {
    const mockAction = jest.fn().mockResolvedValue({
      success: true,
      message: "Success!",
    } as ActionResponse);

    const { result } = renderHook(() => useLocalizedAction(mockAction, "es"));

    const formData = new FormData();
    formData.append("_locale", "fr"); // Existing locale

    await act(async () => {
      await result.current.execute(formData);
    });

    // Should preserve existing locale
    const calledFormData = mockAction.mock.calls[0][0];
    expect(calledFormData.get("_locale")).toBe("fr");
  });

  it("passes additional arguments correctly", async () => {
    const mockAction = jest.fn().mockResolvedValue({
      success: true,
      message: "Success!",
    } as ActionResponse);

    const { result } = renderHook(() => useLocalizedAction(mockAction, "en"));

    const formData = new FormData();

    await act(async () => {
      await result.current.execute(formData, "userId123", { extra: "data" });
    });

    expect(mockAction).toHaveBeenCalledWith(expect.any(FormData), "userId123", {
      extra: "data",
    });
  });
});
