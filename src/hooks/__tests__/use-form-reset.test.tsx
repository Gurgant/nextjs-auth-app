import { renderHook, act } from "@testing-library/react";
import { useFormReset } from "../use-form-reset";
import React from "react";

// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeEach(() => {
  console.log = jest.fn();
  console.error = jest.fn();
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

describe("useFormReset", () => {
  let formElement: HTMLFormElement;

  beforeEach(() => {
    // Create a mock form element
    formElement = document.createElement("form");
    formElement.innerHTML = `
      <input name="text" type="text" value="initial" />
      <textarea name="textarea">initial text</textarea>
      <select name="select">
        <option value="1">One</option>
        <option value="2" selected>Two</option>
      </select>
    `;
    document.body.appendChild(formElement);

    // Mock form methods
    formElement.reset = jest.fn();
  });

  afterEach(() => {
    // Clean up
    if (formElement && document.body.contains(formElement)) {
      document.body.removeChild(formElement);
    }
  });

  describe("basic functionality", () => {
    it("provides a form ref", () => {
      const { result } = renderHook(() => useFormReset());

      expect(result.current.formRef).toBeDefined();
      expect(result.current.formRef.current).toBeNull();
    });

    it("resets form when ref is attached", () => {
      const { result } = renderHook(() => useFormReset());

      // Attach ref to form
      act(() => {
        Object.defineProperty(result.current.formRef, "current", {
          writable: true,
          value: formElement,
        });
      });

      // Reset form
      act(() => {
        result.current.resetForm();
      });

      expect(formElement.reset).toHaveBeenCalled();
    });

    it("validates form before reset", () => {
      const { result } = renderHook(() => useFormReset());

      // Before attaching ref
      expect(result.current.isFormValid()).toBe(false);

      // After attaching ref
      act(() => {
        Object.defineProperty(result.current.formRef, "current", {
          writable: true,
          value: formElement,
        });
      });

      expect(result.current.isFormValid()).toBe(true);
    });
  });

  describe("error handling", () => {
    it("handles missing form ref gracefully", () => {
      const { result } = renderHook(() => useFormReset({ debug: true }));

      act(() => {
        result.current.resetForm();
      });

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Form ref is null"),
      );
    });

    it("handles form without reset method", () => {
      const { result } = renderHook(() => useFormReset({ debug: true }));

      const invalidForm = {} as HTMLFormElement;

      act(() => {
        Object.defineProperty(result.current.formRef, "current", {
          writable: true,
          value: invalidForm,
        });
      });

      act(() => {
        result.current.resetForm();
      });

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Form reset method is not available"),
      );
    });

    it("handles form not in DOM", () => {
      const { result } = renderHook(() => useFormReset({ debug: true }));

      const detachedForm = document.createElement("form");
      detachedForm.reset = jest.fn();

      act(() => {
        Object.defineProperty(result.current.formRef, "current", {
          writable: true,
          value: detachedForm,
        });
      });

      act(() => {
        result.current.resetForm();
      });

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Form is not in the DOM"),
      );
    });

    it("performs fallback reset on error", () => {
      const { result } = renderHook(() => useFormReset());

      // Mock reset to throw error
      formElement.reset = jest.fn(() => {
        throw new Error("Reset failed");
      });

      act(() => {
        Object.defineProperty(result.current.formRef, "current", {
          writable: true,
          value: formElement,
        });
      });

      act(() => {
        result.current.resetForm();
      });

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Error resetting form:"),
        expect.any(Error),
      );

      // Check that fallback reset cleared values
      const input = formElement.querySelector(
        'input[name="text"]',
      ) as HTMLInputElement;
      expect(input.value).toBe("");
    });
  });

  describe("callbacks and options", () => {
    it("calls onReset callback after successful reset", () => {
      const onReset = jest.fn();
      const { result } = renderHook(() => useFormReset({ onReset }));

      act(() => {
        Object.defineProperty(result.current.formRef, "current", {
          writable: true,
          value: formElement,
        });
      });

      act(() => {
        result.current.resetForm();
      });

      expect(onReset).toHaveBeenCalled();
    });

    it("logs debug information when debug is enabled", () => {
      const { result } = renderHook(() =>
        useFormReset({ debug: true, formName: "TestForm" }),
      );

      act(() => {
        Object.defineProperty(result.current.formRef, "current", {
          writable: true,
          value: formElement,
        });
      });

      act(() => {
        result.current.resetForm();
      });

      // Check that debug logging occurred
      expect(console.log).toHaveBeenCalled();

      // Find the success log call
      const successLogCall = (console.log as jest.Mock).mock.calls.find(
        (call) =>
          call[0].includes("[useFormReset:TestForm]") &&
          call[0].includes("✅ Form reset successfully"),
      );

      expect(successLogCall).toBeDefined();
    });
  });

  describe("custom validity and events", () => {
    it("clears custom validity messages", () => {
      const { result } = renderHook(() => useFormReset());

      const input = formElement.querySelector(
        'input[name="text"]',
      ) as HTMLInputElement;
      input.setCustomValidity = jest.fn();

      act(() => {
        Object.defineProperty(result.current.formRef, "current", {
          writable: true,
          value: formElement,
        });
      });

      act(() => {
        result.current.resetForm();
      });

      expect(input.setCustomValidity).toHaveBeenCalledWith("");
    });

    it("dispatches change events on all inputs", () => {
      const { result } = renderHook(() => useFormReset());

      const input = formElement.querySelector(
        'input[name="text"]',
      ) as HTMLInputElement;
      const dispatchEventSpy = jest.spyOn(input, "dispatchEvent");

      act(() => {
        Object.defineProperty(result.current.formRef, "current", {
          writable: true,
          value: formElement,
        });
      });

      act(() => {
        result.current.resetForm();
      });

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "change",
          bubbles: true,
        }),
      );
    });
  });
});
