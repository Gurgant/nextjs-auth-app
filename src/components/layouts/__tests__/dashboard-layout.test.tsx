import React from "react";
import { render } from "@testing-library/react";
import { DashboardLayout } from "../dashboard-layout";

// Mock GradientPageLayout
jest.mock("../gradient-page-layout", () => ({
  GradientPageLayout: ({ children }: any) => (
    <div data-testid="gradient-wrapper">{children}</div>
  ),
}));

describe("DashboardLayout", () => {
  it("renders children correctly", () => {
    const { getByText } = render(
      <DashboardLayout>
        <div>Dashboard Content</div>
      </DashboardLayout>,
    );

    expect(getByText("Dashboard Content")).toBeInTheDocument();
  });

  it("applies default classes without gradient", () => {
    const { container } = render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );

    // Should have min-height wrapper
    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass("min-h-[calc(100vh-4rem)]");

    // Should have py-8 container
    const contentContainer = wrapper?.firstChild;
    expect(contentContainer).toHaveClass("py-8");

    // Should have max-width container with default 4xl
    const innerContainer = contentContainer?.firstChild;
    expect(innerContainer).toHaveClass("max-w-4xl", "mx-auto", "px-4");
  });

  it("applies custom maxWidth", () => {
    const { container } = render(
      <DashboardLayout maxWidth="7xl">
        <div>Content</div>
      </DashboardLayout>,
    );

    const innerContainer = container.querySelector(".mx-auto");
    expect(innerContainer).toHaveClass("max-w-7xl");
  });

  it("merges custom className", () => {
    const { container } = render(
      <DashboardLayout className="bg-gray-50">
        <div>Content</div>
      </DashboardLayout>,
    );

    const contentContainer = container.querySelector(".py-8");
    expect(contentContainer).toHaveClass("bg-gray-50");
  });

  it("wraps with gradient when gradient prop is true", () => {
    const { queryByTestId } = render(
      <DashboardLayout gradient>
        <div>Content</div>
      </DashboardLayout>,
    );

    const gradientWrapper = queryByTestId("gradient-wrapper");
    expect(gradientWrapper).toBeInTheDocument();
  });

  it("does not wrap with gradient when gradient prop is false", () => {
    const { queryByTestId } = render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );

    const gradientWrapper = queryByTestId("gradient-wrapper");
    expect(gradientWrapper).not.toBeInTheDocument();
  });

  it("supports all maxWidth options", () => {
    const widths: Array<"lg" | "xl" | "2xl" | "4xl" | "7xl"> = [
      "lg",
      "xl",
      "2xl",
      "4xl",
      "7xl",
    ];

    widths.forEach((width) => {
      const { container } = render(
        <DashboardLayout maxWidth={width}>
          <div>Content</div>
        </DashboardLayout>,
      );

      const innerContainer = container.querySelector(".mx-auto");
      expect(innerContainer).toHaveClass(`max-w-${width}`);
    });
  });

  it("combines all props correctly", () => {
    const { container, queryByTestId } = render(
      <DashboardLayout gradient maxWidth="2xl" className="custom-class">
        <div>Content</div>
      </DashboardLayout>,
    );

    // Should be wrapped in gradient
    const gradientWrapper = queryByTestId("gradient-wrapper");
    expect(gradientWrapper).toBeInTheDocument();

    // Should have custom class
    const contentContainer = container.querySelector(".py-8");
    expect(contentContainer).toHaveClass("custom-class");

    // Should have custom maxWidth
    const innerContainer = container.querySelector(".mx-auto");
    expect(innerContainer).toHaveClass("max-w-2xl");
  });
});
