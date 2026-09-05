// web/tests/prompt-page.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useSearchParams: vi.fn() }));
vi.mock("../features/workspace", () => ({
  usePromptDoc: vi.fn(),
  workspaceApi: { updatePrompt: vi.fn() },
}));
vi.mock("../features/auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../features/editor", () => ({
  useVersionsStream: vi.fn(),
  editorApi: { createVersion: vi.fn() },
  PromptEditor: (props: { readOnly: boolean; draft: string }) => (
    <div data-testid="prompt-editor" data-readonly={String(props.readOnly)}>
      {props.draft}
    </div>
  ),
  VersionHistory: (props: { versions: { n: number }[] }) => (
    <div data-testid="version-history">{props.versions.length} version(s)</div>
  ),
}));
vi.mock("../features/suggestions", () => ({
  SuggestionsPanel: (props: { draft: string }) => <div data-testid="suggestions-panel">{props.draft}</div>,
}));

import { useSearchParams } from "next/navigation";
import { usePromptDoc, workspaceApi } from "../features/workspace";
import { useAuth } from "../features/auth/useAuth";
import { useVersionsStream } from "../features/editor";
import PromptPage from "../app/(workspace)/p/[promptId]/page";
import type { Version } from "../shared/types";

const basePrompt = {
  id: "p1", projectId: "j1", name: "Ticket triage", tags: ["draft"],
  archived: false, bestScore: null, latestVersion: 1,
};
const version1: Version = { n: 1, text: "Summarize the ticket.", note: "Initial draft", technique: null, createdBy: "u1", createdAt: null };

function setup(role: string | null, promptOverrides: Partial<typeof basePrompt> = {}, versions: Version[] = [version1]) {
  vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("project=j1") as never);
  vi.mocked(useAuth).mockReturnValue({
    firebaseUser: null, loading: false, signOut: vi.fn(),
    profile: role ? { uid: "u1", email: "a@b.com", name: "A", role: role as never, createdAt: "x" } : null,
  });
  vi.mocked(usePromptDoc).mockReturnValue({ data: { ...basePrompt, ...promptOverrides }, error: null });
  vi.mocked(useVersionsStream).mockReturnValue({ data: versions, error: null });
  return render(<PromptPage params={{ promptId: "p1" }} />);
}

beforeEach(() => {
  vi.mocked(usePromptDoc).mockReset();
  vi.mocked(useAuth).mockReset();
  vi.mocked(useSearchParams).mockReset();
  vi.mocked(useVersionsStream).mockReset();
  vi.mocked(workspaceApi.updatePrompt).mockReset();
  vi.mocked(workspaceApi.updatePrompt).mockResolvedValue({} as never);
});

describe("PromptPage", () => {
  it("shows the name as readOnly and no Archive button for a viewer", () => {
    setup("viewer");
    const input = screen.getByDisplayValue("Ticket triage");
    expect(input).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: /archive/i })).not.toBeInTheDocument();
  });

  it("shows the editor read-only for a viewer", () => {
    setup("viewer");
    expect(screen.getByTestId("prompt-editor")).toHaveAttribute("data-readonly", "true");
  });

  it("shows the editor editable for a contributor", () => {
    setup("contributor");
    expect(screen.getByTestId("prompt-editor")).toHaveAttribute("data-readonly", "false");
  });

  it("shows an Archive button for a maintainer, which calls updatePrompt with archived:true", () => {
    setup("maintainer");
    const button = screen.getByRole("button", { name: "Archive" });
    fireEvent.click(button);
    expect(workspaceApi.updatePrompt).toHaveBeenCalledWith("j1", "p1", { archived: true });
  });

  it("passes the current version's text into the editor as the initial draft", () => {
    setup("contributor");
    expect(screen.getByTestId("prompt-editor")).toHaveTextContent("Summarize the ticket.");
  });

  it("renders VersionHistory with the versions from useVersionsStream", () => {
    setup("contributor", {}, [version1, { ...version1, n: 2, note: "Applied: Clear and direct", technique: "Clear and direct" }]);
    expect(screen.getByTestId("version-history")).toHaveTextContent("2 version(s)");
  });

  it("renders the SuggestionsPanel with the current draft", () => {
    setup("contributor");
    expect(screen.getByTestId("suggestions-panel")).toHaveTextContent("Summarize the ticket.");
  });

  it("shows a loading state while the prompt hasn't loaded yet", () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("project=j1") as never);
    vi.mocked(useAuth).mockReturnValue({
      firebaseUser: null, loading: false, signOut: vi.fn(),
      profile: { uid: "u1", email: "a@b.com", name: "A", role: "viewer" as never, createdAt: "x" },
    });
    vi.mocked(usePromptDoc).mockReturnValue({ data: null, error: null });
    render(<PromptPage params={{ promptId: "p1" }} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an inline error message instead of the form when the prompt stream errors", () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("project=j1") as never);
    vi.mocked(useAuth).mockReturnValue({
      firebaseUser: null, loading: false, signOut: vi.fn(),
      profile: { uid: "u1", email: "a@b.com", name: "A", role: "viewer" as never, createdAt: "x" },
    });
    vi.mocked(usePromptDoc).mockReturnValue({ data: null, error: new Error("permission-denied") });
    render(<PromptPage params={{ promptId: "p1" }} />);
    expect(screen.getByText("permission-denied")).toBeInTheDocument();
  });
});
