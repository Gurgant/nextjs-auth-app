import { renderHook, act } from "@testing-library/react";
import { z } from "zod";
import { useMultiStepForm, type FormStep } from "../use-multi-step-form";

describe("useMultiStepForm", () => {
  const mockSteps: FormStep[] = [
    {
      id: "personal",
      label: "Personal Information",
      schema: z.object({
        name: z.string().min(1),
        email: z.string().email(),
      }),
    },
    {
      id: "address",
      label: "Address",
      schema: z.object({
        street: z.string().min(1),
        city: z.string().min(1),
      }),
    },
    {
      id: "preferences",
      label: "Preferences",
      canSkip: true,
    },
  ];

  it("initializes with the first step by default", () => {
    const { result } = renderHook(() => useMultiStepForm({ steps: mockSteps }));

    expect(result.current.currentStep).toBe(0);
    expect(result.current.currentStepData.id).toBe("personal");
    expect(result.current.isFirstStep).toBe(true);
    expect(result.current.isLastStep).toBe(false);
    expect(result.current.totalSteps).toBe(3);
  });

  it("initializes with a custom initial step", () => {
    const { result } = renderHook(() =>
      useMultiStepForm({ steps: mockSteps, initialStep: 1 }),
    );

    expect(result.current.currentStep).toBe(1);
    expect(result.current.currentStepData.id).toBe("address");
  });

  it("navigates to the next step", () => {
    const { result } = renderHook(() => useMultiStepForm({ steps: mockSteps }));

    act(() => {
      result.current.goToNext();
    });

    expect(result.current.currentStep).toBe(1);
    expect(result.current.currentStepData.id).toBe("address");
  });

  it("navigates to the previous step", () => {
    const { result } = renderHook(() =>
      useMultiStepForm({ steps: mockSteps, initialStep: 1 }),
    );

    act(() => {
      result.current.goToPrevious();
    });

    expect(result.current.currentStep).toBe(0);
    expect(result.current.currentStepData.id).toBe("personal");
  });

  it("does not go beyond first or last step", () => {
    const { result } = renderHook(() => useMultiStepForm({ steps: mockSteps }));

    // Try to go before first step
    act(() => {
      result.current.goToPrevious();
    });
    expect(result.current.currentStep).toBe(0);

    // Go to last step
    act(() => {
      result.current.goToStep(2);
    });

    // Try to go beyond last step
    act(() => {
      result.current.goToNext();
    });
    expect(result.current.currentStep).toBe(2);
  });

  it("navigates to a specific step", () => {
    const { result } = renderHook(() => useMultiStepForm({ steps: mockSteps }));

    act(() => {
      result.current.goToStep(2);
    });

    expect(result.current.currentStep).toBe(2);
    expect(result.current.currentStepData.id).toBe("preferences");
    expect(result.current.isLastStep).toBe(true);
  });

  it("ignores invalid step indices", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { result } = renderHook(() => useMultiStepForm({ steps: mockSteps }));

    act(() => {
      result.current.goToStep(-1);
    });
    expect(result.current.currentStep).toBe(0);

    act(() => {
      result.current.goToStep(10);
    });
    expect(result.current.currentStep).toBe(0);

    consoleError.mockRestore();
  });

  it("updates step data", () => {
    const { result } = renderHook(() => useMultiStepForm({ steps: mockSteps }));

    act(() => {
      result.current.updateStepData({
        name: "John",
        email: "john@example.com",
      });
    });

    expect(result.current.stepData).toEqual({
      personal: { name: "John", email: "john@example.com" },
    });

    // Move to next step and update
    act(() => {
      result.current.goToNext();
    });

    act(() => {
      result.current.updateStepData({
        street: "123 Main St",
        city: "New York",
      });
    });

    expect(result.current.stepData).toEqual({
      personal: { name: "John", email: "john@example.com" },
      address: { street: "123 Main St", city: "New York" },
    });
  });

  it("validates current step data with schema", async () => {
    const { result } = renderHook(() => useMultiStepForm({ steps: mockSteps }));

    // Invalid data
    const invalidResult = await result.current.validateCurrentStep({
      name: "",
      email: "invalid-email",
    });

    expect(invalidResult.success).toBe(false);
    expect(invalidResult.errors).toBeDefined();

    // Valid data
    const validResult = await result.current.validateCurrentStep({
      name: "John",
      email: "john@example.com",
    });

    expect(validResult.success).toBe(true);
    expect(validResult.errors).toBeUndefined();
  });

  it("validates steps without schema", async () => {
    const { result } = renderHook(() => useMultiStepForm({ steps: mockSteps }));

    // Go to step without schema
    act(() => {
      result.current.goToStep(2);
    });

    const validationResult = await result.current.validateCurrentStep({});
    expect(validationResult.success).toBe(true);
  });

  it("calculates progress correctly", () => {
    const { result } = renderHook(() => useMultiStepForm({ steps: mockSteps }));

    expect(result.current.progress).toBeCloseTo(33.33, 1); // 1/3

    act(() => {
      result.current.goToNext();
    });
    expect(result.current.progress).toBeCloseTo(66.67, 1); // 2/3

    act(() => {
      result.current.goToNext();
    });
    expect(result.current.progress).toBe(100); // 3/3
  });

  it("correctly identifies navigation capabilities", () => {
    const { result } = renderHook(() => useMultiStepForm({ steps: mockSteps }));

    // First step
    expect(result.current.canGoPrevious).toBe(false);
    expect(result.current.canGoNext).toBe(true);

    // Middle step
    act(() => {
      result.current.goToNext();
    });
    expect(result.current.canGoPrevious).toBe(true);
    expect(result.current.canGoNext).toBe(true);

    // Last step
    act(() => {
      result.current.goToNext();
    });
    expect(result.current.canGoPrevious).toBe(true);
    expect(result.current.canGoNext).toBe(false);
  });

  it("calls onStepChange callback", () => {
    const onStepChange = jest.fn();
    const { result } = renderHook(() =>
      useMultiStepForm({ steps: mockSteps, onStepChange }),
    );

    act(() => {
      result.current.goToNext();
    });

    expect(onStepChange).toHaveBeenCalledWith(1, "address");

    act(() => {
      result.current.goToStep(2);
    });

    expect(onStepChange).toHaveBeenCalledWith(2, "preferences");
  });

  it("calls onComplete when trying to go next on last step", () => {
    const onComplete = jest.fn();
    const { result } = renderHook(() =>
      useMultiStepForm({ steps: mockSteps, onComplete }),
    );

    // Add some data
    act(() => {
      result.current.updateStepData({
        name: "John",
        email: "john@example.com",
      });
      result.current.goToStep(2); // Go to last step
    });

    // Try to go next on last step
    act(() => {
      result.current.goToNext();
    });

    expect(onComplete).toHaveBeenCalledWith({
      personal: { name: "John", email: "john@example.com" },
    });
  });

  it("resets the form state", () => {
    const onStepChange = jest.fn();
    const { result } = renderHook(() =>
      useMultiStepForm({ steps: mockSteps, onStepChange }),
    );

    // Make some changes
    act(() => {
      result.current.updateStepData({
        name: "John",
        email: "john@example.com",
      });
    });

    act(() => {
      result.current.goToNext();
    });

    act(() => {
      result.current.updateStepData({
        street: "123 Main St",
        city: "New York",
      });
    });

    expect(result.current.currentStep).toBe(1);
    expect(Object.keys(result.current.stepData).length).toBe(2);

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.currentStep).toBe(0);
    expect(result.current.stepData).toEqual({});
    expect(onStepChange).toHaveBeenCalledWith(0, "personal");
  });

  it("resets with custom initial step", () => {
    const { result } = renderHook(() =>
      useMultiStepForm({ steps: mockSteps, initialStep: 1 }),
    );

    act(() => {
      result.current.goToNext();
      result.current.updateStepData({ preferences: true });
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.currentStep).toBe(1);
    expect(result.current.currentStepData.id).toBe("address");
    expect(result.current.stepData).toEqual({});
  });
});
