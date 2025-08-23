import { render, screen, fireEvent } from "@testing-library/react";
import { GradientButton } from "../gradient-button";

describe("GradientButton", () => {
  it("renders with default props", () => {
    render(<GradientButton>Click me</GradientButton>);
    const button = screen.getByRole("button", { name: "Click me" });

    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("from-blue-600", "to-purple-700");
    expect(button).toHaveClass("py-3", "px-4", "text-sm");
    expect(button).not.toHaveClass("w-full");
  });

  it("renders with different variants", () => {
    const { rerender } = render(
      <GradientButton variant="green">Green</GradientButton>,
    );
    let button = screen.getByRole("button");
    expect(button).toHaveClass("from-green-600", "to-green-700");

    rerender(<GradientButton variant="red">Red</GradientButton>);
    button = screen.getByRole("button");
    expect(button).toHaveClass("from-red-600", "to-red-700");

    rerender(<GradientButton variant="yellow-orange">Yellow</GradientButton>);
    button = screen.getByRole("button");
    expect(button).toHaveClass("from-yellow-600", "to-orange-600");
  });

  it("renders with different sizes", () => {
    const { rerender } = render(
      <GradientButton size="sm">Small</GradientButton>,
    );
    let button = screen.getByRole("button");
    expect(button).toHaveClass("py-2", "px-3", "text-xs");

    rerender(<GradientButton size="lg">Large</GradientButton>);
    button = screen.getByRole("button");
    expect(button).toHaveClass("py-4", "px-6", "text-base");
  });

  it("renders full width when specified", () => {
    render(<GradientButton fullWidth>Full Width</GradientButton>);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("w-full");
  });

  it("shows loading state correctly", () => {
    render(
      <GradientButton loading loadingText="Saving...">
        Save
      </GradientButton>,
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(screen.getByText("Saving...")).toBeInTheDocument();
    // Check for LoadingSpinner by its SVG structure
    expect(button.querySelector("svg")).toHaveClass("animate-spin");
  });

  it("shows loading spinner without custom text", () => {
    render(<GradientButton loading>Save</GradientButton>);

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(button.querySelector("svg")).toHaveClass("animate-spin");
  });

  it("handles disabled state", () => {
    render(<GradientButton disabled>Disabled</GradientButton>);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveClass(
      "disabled:opacity-50",
      "disabled:cursor-not-allowed",
    );
  });

  it("applies custom className", () => {
    render(<GradientButton className="custom-class">Custom</GradientButton>);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("custom-class");
  });

  it("handles click events", () => {
    const handleClick = jest.fn();
    render(<GradientButton onClick={handleClick}>Click me</GradientButton>);

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire click when disabled", () => {
    const handleClick = jest.fn();
    render(
      <GradientButton disabled onClick={handleClick}>
        Disabled
      </GradientButton>,
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(handleClick).not.toHaveBeenCalled();
  });

  it("does not fire click when loading", () => {
    const handleClick = jest.fn();
    render(
      <GradientButton loading onClick={handleClick}>
        Loading
      </GradientButton>,
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(handleClick).not.toHaveBeenCalled();
  });

  it("forwards ref correctly", () => {
    const ref = jest.fn();
    render(<GradientButton ref={ref}>Button</GradientButton>);

    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLButtonElement);
  });

  it("passes through other button props", () => {
    render(
      <GradientButton type="submit" form="test-form" name="submit-btn">
        Submit
      </GradientButton>,
    );

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveAttribute("form", "test-form");
    expect(button).toHaveAttribute("name", "submit-btn");
  });
});
