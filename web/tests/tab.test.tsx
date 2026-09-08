import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Tab } from "../shared/ui/Tab";

describe("Tab", () => {
  it("renders its icon before the label when given", () => {
    render(
      <Tab active={false} onClick={vi.fn()} icon={<svg data-testid="tab-icon" />}>
        Setup
      </Tab>,
    );
    expect(screen.getByTestId("tab-icon")).toBeInTheDocument();
    expect(screen.getByText("Setup")).toBeInTheDocument();
  });

  it("renders with no icon when none is given", () => {
    render(
      <Tab active onClick={vi.fn()}>
        Dataset
      </Tab>,
    );
    expect(screen.queryByTestId("tab-icon")).not.toBeInTheDocument();
  });

  it("calls onClick when clicked, regardless of active state", () => {
    const onClick = vi.fn();
    render(
      <Tab active={false} onClick={onClick}>
        Run
      </Tab>,
    );
    fireEvent.click(screen.getByText("Run"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("still renders the count badge and dot indicator", () => {
    render(
      <Tab active onClick={vi.fn()} count={3} dot>
        Dataset
      </Tab>,
    );
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
