import React from "react";
import { render } from "@testing-library/react";
import { CenteredContentLayout } from "../centered-content-layout";

describe("CenteredContentLayout", () => {
  it("renders children correctly", () => {
    const { getByText } = render(
      <CenteredContentLayout>
        <div>Test Content</div>
      </CenteredContentLayout>,
    );

    expect(getByText("Test Content")).toBeInTheDocument();
  });

  it("applies default classes", () => {
    const { container } = render(
      <CenteredContentLayout>
        <div>Content</div>
      </CenteredContentLayout>,
    );

    const outerDiv = container.firstChild;
    expect(outerDiv).toHaveClass(
      "flex",
      "items-center",
      "justify-center",
      "px-4",
      "py-8",
    );
    expect(outerDiv).toHaveClass("min-h-[calc(100vh-4rem)]"); // fullHeight default true

    const innerDiv = outerDiv?.firstChild;
    expect(innerDiv).toHaveClass("w-full", "max-w-md"); // default maxWidth
  });

  it("applies custom maxWidth", () => {
    const { container } = render(
      <CenteredContentLayout maxWidth="lg">
        <div>Content</div>
      </CenteredContentLayout>,
    );

    const innerDiv = container.firstChild?.firstChild;
    expect(innerDiv).toHaveClass("max-w-lg");
  });

  it("supports all maxWidth options", () => {
    const widths: Array<"sm" | "md" | "lg" | "xl" | "2xl" | "4xl" | "7xl"> = [
      "sm",
      "md",
      "lg",
      "xl",
      "2xl",
      "4xl",
      "7xl",
    ];

    widths.forEach((width) => {
      const { container } = render(
        <CenteredContentLayout maxWidth={width}>
          <div>Content</div>
        </CenteredContentLayout>,
      );

      const innerDiv = container.firstChild?.firstChild;
      expect(innerDiv).toHaveClass(`max-w-${width}`);
    });
  });

  it("respects fullHeight false", () => {
    const { container } = render(
      <CenteredContentLayout fullHeight={false}>
        <div>Content</div>
      </CenteredContentLayout>,
    );

    const outerDiv = container.firstChild;
    expect(outerDiv).not.toHaveClass("min-h-[calc(100vh-4rem)]");
  });

  it("merges custom className", () => {
    const { container } = render(
      <CenteredContentLayout className="bg-gray-50">
        <div>Content</div>
      </CenteredContentLayout>,
    );

    const outerDiv = container.firstChild;
    expect(outerDiv).toHaveClass("bg-gray-50");
    // Should also have default classes
    expect(outerDiv).toHaveClass("flex", "items-center", "justify-center");
  });

  it("combines all props correctly", () => {
    const { container } = render(
      <CenteredContentLayout
        maxWidth="2xl"
        fullHeight={false}
        className="bg-blue-50"
      >
        <div>Content</div>
      </CenteredContentLayout>,
    );

    const outerDiv = container.firstChild;
    expect(outerDiv).toHaveClass("bg-blue-50");
    expect(outerDiv).not.toHaveClass("min-h-[calc(100vh-4rem)]");

    const innerDiv = outerDiv?.firstChild;
    expect(innerDiv).toHaveClass("max-w-2xl");
  });
});
