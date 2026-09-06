import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// SuggestionsPanel renders SuggestionCard, which imports DiffBlock via the editor
// feature's public index — that barrel also re-exports useVersionsStream/editorApi,
// which ultimately import shared/firebase/client. That module reads
// NEXT_PUBLIC_FIREBASE_CONFIG at import time and throws if unset, so stub it out here
// (same pattern as tests/use-auth.test.tsx and tests/api-client.test.ts) rather than
// requiring real Firebase config for a test that never touches Firebase.
vi.mock("../shared/firebase/client", () => ({ auth: { currentUser: null }, db: {} }));

vi.mock("../features/suggestions/suggestionsApi", () => ({ suggestionsApi: { generate: vi.fn() } }));

import { suggestionsApi } from "../features/suggestions/suggestionsApi";
import { SuggestionsPanel } from "../features/suggestions/SuggestionsPanel";
import type { Suggestion } from "../shared/types";

const suggestion: Suggestion = {
  ruleId: "clear", technique: "Clear and direct", evidence: "Hedging language...",
  oldText: "Try to help.", newText: "Help.",
};
const can = { edit: true, settings: false, admin: false };

beforeEach(() => {
  // Block body (not an implicit-return arrow) — `mockReset()` returns the mock itself,
  // and returning that from the beforeEach callback makes TS mis-infer it as a
  // `HookCleanupCallback`, since the returned mock function's own signature (3 args)
  // doesn't match the zero-arg cleanup signature vitest expects.
  vi.mocked(suggestionsApi.generate).mockReset();
});

describe("SuggestionsPanel", () => {
  it("fetches and renders suggestions for the current draft", async () => {
    vi.mocked(suggestionsApi.generate).mockResolvedValue([suggestion]);
    render(<SuggestionsPanel projectId="j1" promptId="p1" draft="Try to help." can={can} onApply={vi.fn()} />);
    await vi.waitFor(() => expect(suggestionsApi.generate).toHaveBeenCalledWith("j1", "p1", "Try to help."));
    await screen.findByText("Clear and direct");
  });

  it("hides a dismissed suggestion without calling onApply", async () => {
    vi.mocked(suggestionsApi.generate).mockResolvedValue([suggestion]);
    render(<SuggestionsPanel projectId="j1" promptId="p1" draft="Try to help." can={can} onApply={vi.fn()} />);
    await screen.findByText("Clear and direct");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(screen.queryByText("Clear and direct")).not.toBeInTheDocument();
  });

  it("calls onApply with the suggestion when Apply is clicked", async () => {
    vi.mocked(suggestionsApi.generate).mockResolvedValue([suggestion]);
    const onApply = vi.fn();
    render(<SuggestionsPanel projectId="j1" promptId="p1" draft="Try to help." can={can} onApply={onApply} />);
    await screen.findByText("Clear and direct");
    fireEvent.click(screen.getByText("Apply as new version"));
    expect(onApply).toHaveBeenCalledWith(suggestion);
  });

  it("shows a role caption instead of fetching for a viewer", () => {
    render(<SuggestionsPanel projectId="j1" promptId="p1" draft="Try to help." can={{ edit: false, settings: false, admin: false }} onApply={vi.fn()} />);
    expect(screen.getByText(/Requires contributor role/)).toBeInTheDocument();
    expect(suggestionsApi.generate).not.toHaveBeenCalled();
  });

  it("ignores a stale response that resolves after a newer in-flight request", async () => {
    // Regression test for the race where an older debounced generate() call
    // resolves after a newer one and clobbers the fresher suggestions.
    const deferreds: Record<string, (result: Suggestion[]) => void> = {};
    vi.mocked(suggestionsApi.generate).mockImplementation(
      (_projectId: string, _promptId: string, draft: string) =>
        new Promise<Suggestion[]>((resolve) => {
          deferreds[draft] = resolve;
        }),
    );

    const { rerender } = render(
      <SuggestionsPanel projectId="j1" promptId="p1" draft="first draft" can={can} onApply={vi.fn()} />,
    );
    await vi.waitFor(() => expect(suggestionsApi.generate).toHaveBeenCalledWith("j1", "p1", "first draft"));

    rerender(<SuggestionsPanel projectId="j1" promptId="p1" draft="second draft" can={can} onApply={vi.fn()} />);
    await vi.waitFor(() => expect(suggestionsApi.generate).toHaveBeenCalledWith("j1", "p1", "second draft"));

    const newer: Suggestion = { ruleId: "newer", technique: "Newer result", evidence: "...", oldText: "x", newText: "y" };
    const stale: Suggestion = { ruleId: "stale", technique: "Stale result", evidence: "...", oldText: "x", newText: "y" };

    // The newer (second) request resolves first, as it would for a fast response...
    deferreds["second draft"]([newer]);
    await screen.findByText("Newer result");

    // ...and the older (first) request's stale response arrives after it.
    deferreds["first draft"]([stale]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.getByText("Newer result")).toBeInTheDocument();
    expect(screen.queryByText("Stale result")).not.toBeInTheDocument();
  });
});
