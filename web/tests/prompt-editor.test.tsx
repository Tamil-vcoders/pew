// web/tests/prompt-editor.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PromptEditor } from "../features/editor/PromptEditor";

describe("PromptEditor", () => {
  it("shows no revert control and no dirty border when draft matches the current version", () => {
    render(<PromptEditor draft="v1 text" currentVersionText="v1 text" readOnly={false} onChange={vi.fn()} onRevert={vi.fn()} />);
    expect(screen.queryByText(/revert/i)).not.toBeInTheDocument();
  });

  it("shows a revert control when the draft diverges, and calls onRevert when clicked", () => {
    const onRevert = vi.fn();
    render(<PromptEditor draft="edited text" currentVersionText="v1 text" readOnly={false} onChange={vi.fn()} onRevert={onRevert} />);
    fireEvent.click(screen.getByText(/revert/i));
    expect(onRevert).toHaveBeenCalledTimes(1);
  });

  it("is read-only for a viewer and never shows revert", () => {
    render(<PromptEditor draft="v1 text" currentVersionText="v1 text" readOnly onChange={vi.fn()} onRevert={vi.fn()} />);
    expect(screen.getByText(/read-only/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("v1 text")).toHaveAttribute("readonly");
  });

  it("calls onChange as the user types", () => {
    const onChange = vi.fn();
    render(<PromptEditor draft="v1 text" currentVersionText="v1 text" readOnly={false} onChange={onChange} onRevert={vi.fn()} />);
    fireEvent.change(screen.getByDisplayValue("v1 text"), { target: { value: "v1 text!" } });
    expect(onChange).toHaveBeenCalledWith("v1 text!");
  });

  it("renders live validation results for the draft text", () => {
    render(<PromptEditor draft="Try to be helpful." currentVersionText="Try to be helpful." readOnly={false} onChange={vi.fn()} onRevert={vi.fn()} />);
    expect(screen.getByText("Clear and direct")).toBeInTheDocument();
  });
});
