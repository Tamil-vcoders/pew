import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// SuggestionCard imports DiffBlock via the editor feature's public index (per the
// cross-feature import rule), which also re-exports useVersionsStream/editorApi — both
// of which ultimately import shared/firebase/client. That module reads
// NEXT_PUBLIC_FIREBASE_CONFIG at import time and throws if it's unset, so — following
// the same pattern already used in tests/use-auth.test.tsx and tests/api-client.test.ts —
// stub it out here rather than requiring real Firebase config for a component test that
// never touches Firebase.
vi.mock("../shared/firebase/client", () => ({ auth: { currentUser: null }, db: {} }));

import { SuggestionCard } from "../features/suggestions/SuggestionCard";
import type { Suggestion } from "../shared/types";

const suggestion: Suggestion = {
  ruleId: "clear", technique: "Clear and direct",
  evidence: 'Hedging language ("try to") leaves the task underspecified.',
  oldText: "Try to help.", newText: "Help.",
};

describe("SuggestionCard", () => {
  it("shows the technique, evidence, and diff", () => {
    render(<SuggestionCard suggestion={suggestion} canApply onApply={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText("Clear and direct")).toBeInTheDocument();
    expect(screen.getByText(/Hedging language/)).toBeInTheDocument();
    expect(screen.getByText("Try to help.")).toBeInTheDocument();
    expect(screen.getByText("Help.")).toBeInTheDocument();
  });

  it("calls onApply/onDismiss when a contributor clicks the buttons", () => {
    const onApply = vi.fn();
    const onDismiss = vi.fn();
    render(<SuggestionCard suggestion={suggestion} canApply onApply={onApply} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("Apply as new version"));
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("hides the action buttons when canApply is false", () => {
    render(<SuggestionCard suggestion={suggestion} canApply={false} onApply={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.queryByText("Apply as new version")).not.toBeInTheDocument();
    expect(screen.queryByText("Dismiss")).not.toBeInTheDocument();
  });
});
