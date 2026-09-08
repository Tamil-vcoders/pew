// web/tests/prompt-page.test.tsx
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useSearchParams: vi.fn() }));
// The prompt name input, tags, version chip, and Archive button used to render directly in
// this page; they now live in the persistent header bar (app/(workspace)/layout.tsx), which
// this test doesn't render. This page's job is only to PUBLISH the right data into
// ActivePromptHeaderContext (via useActivePromptHeader().setHeader) -- verified below by
// mocking the hook itself and inspecting what it was called with. How the layout renders
// that data is covered separately by tests/workspace-layout.test.tsx.
const setHeaderMock = vi.fn();
vi.mock("../features/workspace", () => ({
  usePromptDoc: vi.fn(),
  useProjectDoc: vi.fn(),
  workspaceApi: { updatePrompt: vi.fn() },
  useActivePromptHeader: () => ({ header: null, setHeader: setHeaderMock }),
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
vi.mock("../features/dataset", () => ({
  useDatasetStream: vi.fn(),
  DatasetTab: (props: { cases: unknown[] }) => (
    <div data-testid="dataset-tab">{(props.cases as unknown[]).length} case(s)</div>
  ),
}));
vi.mock("../features/runs", () => ({
  RunTab: () => <div data-testid="run-tab" />,
}));
vi.mock("../features/setup", () => ({
  SetupTab: () => <div data-testid="setup-tab" />,
}));
vi.mock("../features/cycle", () => ({
  useCycle: vi.fn(),
  useCycleElsewhereLabel: () => null,
  cycleApi: { stop: vi.fn() },
  CycleBanner: () => <div data-testid="cycle-banner" />,
}));

import { useSearchParams } from "next/navigation";
import { usePromptDoc, useProjectDoc, workspaceApi } from "../features/workspace";
import { useAuth } from "../features/auth/useAuth";
import { useVersionsStream } from "../features/editor";
import { useDatasetStream } from "../features/dataset";
import { useCycle } from "../features/cycle";
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
    firebaseUser: null, loading: false, signOut: vi.fn(), refreshProfile: vi.fn(),
    profile: role ? { uid: "u1", email: "a@b.com", name: "A", role: role as never, createdAt: "x" } : null,
  });
  vi.mocked(usePromptDoc).mockReturnValue({ data: { ...basePrompt, ...promptOverrides }, error: null });
  vi.mocked(useVersionsStream).mockReturnValue({ data: versions, error: null });
  vi.mocked(useProjectDoc).mockReturnValue({ data: null, error: null });
  vi.mocked(useDatasetStream).mockReturnValue({ data: [], error: null });
  vi.mocked(useCycle).mockReturnValue({ data: null, error: null });
  return render(<PromptPage params={{ promptId: "p1" }} />);
}

beforeEach(() => {
  vi.mocked(usePromptDoc).mockReset();
  vi.mocked(useProjectDoc).mockReset();
  vi.mocked(useDatasetStream).mockReset();
  vi.mocked(useAuth).mockReset();
  vi.mocked(useSearchParams).mockReset();
  vi.mocked(useVersionsStream).mockReset();
  vi.mocked(useCycle).mockReset();
  vi.mocked(workspaceApi.updatePrompt).mockReset();
  vi.mocked(workspaceApi.updatePrompt).mockResolvedValue({} as never);
  setHeaderMock.mockReset();
  vi.mocked(useProjectDoc).mockReturnValue({ data: null, error: null });
  vi.mocked(useDatasetStream).mockReturnValue({ data: [], error: null });
  vi.mocked(useCycle).mockReturnValue({ data: null, error: null });
});

describe("PromptPage", () => {
  it("publishes canEdit:false and canSettings:false for a viewer (the header renders the name read-only and hides Archive for these)", () => {
    setup("viewer");
    const lastCall = setHeaderMock.mock.calls.at(-1)?.[0];
    expect(lastCall).toMatchObject({ promptName: "Ticket triage", canEdit: false, canSettings: false });
  });

  it("shows the editor read-only for a viewer", () => {
    setup("viewer");
    expect(screen.getByTestId("prompt-editor")).toHaveAttribute("data-readonly", "true");
  });

  it("shows the editor editable for a contributor", () => {
    setup("contributor");
    expect(screen.getByTestId("prompt-editor")).toHaveAttribute("data-readonly", "false");
  });

  it("publishes canSettings:true for a maintainer, and its onToggleArchive calls updatePrompt with archived:true", () => {
    setup("maintainer");
    const lastCall = setHeaderMock.mock.calls.at(-1)?.[0];
    expect(lastCall).toMatchObject({ canSettings: true, archived: false });
    lastCall.onToggleArchive();
    expect(workspaceApi.updatePrompt).toHaveBeenCalledWith("j1", "p1", { archived: true });
  });

  it("publishes the project name, tags, and version, and its onRunOnce switches to the Run tab", () => {
    setup("contributor");
    const lastCall = setHeaderMock.mock.calls.at(-1)?.[0];
    expect(lastCall).toMatchObject({ tags: ["draft"], latestVersion: 1, isDirty: false });
    expect(screen.queryByTestId("run-tab")).not.toBeInTheDocument();
    act(() => {
      lastCall.onRunOnce();
    });
    expect(screen.getByTestId("run-tab")).toBeInTheDocument();
  });

  it("its onRename calls updatePrompt with the new name", () => {
    setup("contributor");
    const lastCall = setHeaderMock.mock.calls.at(-1)?.[0];
    lastCall.onRename("Renamed prompt");
    expect(workspaceApi.updatePrompt).toHaveBeenCalledWith("j1", "p1", { name: "Renamed prompt" });
  });

  it("its onTagsChange calls updatePrompt with the new tag list", () => {
    setup("contributor");
    const lastCall = setHeaderMock.mock.calls.at(-1)?.[0];
    lastCall.onTagsChange(["draft", "urgent"]);
    expect(workspaceApi.updatePrompt).toHaveBeenCalledWith("j1", "p1", { tags: ["draft", "urgent"] });
  });

  it("passes the current version's text into the editor as the initial draft", () => {
    setup("contributor");
    expect(screen.getByTestId("prompt-editor")).toHaveTextContent("Summarize the ticket.");
  });

  it("renders VersionHistory with the versions from useVersionsStream", () => {
    setup("contributor", {}, [version1, { ...version1, n: 2, note: "Applied: Clear and direct", technique: "Clear and direct" }]);
    expect(screen.getByTestId("version-history")).toHaveTextContent("2 version(s)");
  });

  it("renders the SuggestionsPanel with the current draft once the Suggestions tab is opened", () => {
    setup("contributor");
    fireEvent.click(screen.getByRole("button", { name: "Suggestions" }));
    expect(screen.getByTestId("suggestions-panel")).toHaveTextContent("Summarize the ticket.");
  });

  it("renders the Dataset tab by default with the case count from useDatasetStream", () => {
    setup("contributor");
    expect(screen.getByTestId("dataset-tab")).toHaveTextContent("0 case(s)");
  });

  it("syncs the draft to the real version text once versions finish loading async (regression)", () => {
    // Regression test: useVersionsStream's onSnapshot never delivers data synchronously on
    // first render — it starts as [] and populates a tick later. Reproduce that race by
    // returning an empty versions array on the first call, then the real populated array on
    // a subsequent render, and assert the editor's draft ends up showing the real text
    // rather than staying stuck at "".
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("project=j1") as never);
    vi.mocked(useAuth).mockReturnValue({
      firebaseUser: null, loading: false, signOut: vi.fn(), refreshProfile: vi.fn(),
      profile: { uid: "u1", email: "a@b.com", name: "A", role: "contributor" as never, createdAt: "x" },
    });
    vi.mocked(usePromptDoc).mockReturnValue({ data: basePrompt, error: null });
    vi.mocked(useVersionsStream).mockReturnValueOnce({ data: [], error: null });
    vi.mocked(useVersionsStream).mockReturnValue({ data: [version1], error: null });

    const { rerender } = render(<PromptPage params={{ promptId: "p1" }} />);
    expect(screen.getByTestId("prompt-editor")).toHaveTextContent("");

    rerender(<PromptPage params={{ promptId: "p1" }} />);
    expect(screen.getByTestId("prompt-editor")).toHaveTextContent("Summarize the ticket.");
  });

  it("shows a loading state while the prompt hasn't loaded yet", () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("project=j1") as never);
    vi.mocked(useAuth).mockReturnValue({
      firebaseUser: null, loading: false, signOut: vi.fn(), refreshProfile: vi.fn(),
      profile: { uid: "u1", email: "a@b.com", name: "A", role: "viewer" as never, createdAt: "x" },
    });
    vi.mocked(usePromptDoc).mockReturnValue({ data: null, error: null });
    render(<PromptPage params={{ promptId: "p1" }} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an inline error message instead of the form when the prompt stream errors", () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("project=j1") as never);
    vi.mocked(useAuth).mockReturnValue({
      firebaseUser: null, loading: false, signOut: vi.fn(), refreshProfile: vi.fn(),
      profile: { uid: "u1", email: "a@b.com", name: "A", role: "viewer" as never, createdAt: "x" },
    });
    vi.mocked(usePromptDoc).mockReturnValue({ data: null, error: new Error("permission-denied") });
    render(<PromptPage params={{ promptId: "p1" }} />);
    expect(screen.getByText("permission-denied")).toBeInTheDocument();
  });
});
