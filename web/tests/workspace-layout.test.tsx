// web/tests/workspace-layout.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/p/p1",
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
// ActivePromptHeaderProvider/useActivePromptHeader are plain React context (no Firestore
// dependency) -- import the real implementation directly from its own file (not through
// "../features/workspace"'s aggregating index.ts, which also re-exports Firestore-dependent
// hooks like useProjectsStream that would throw in this test's env) so this test exercises
// the actual publish/read wiring the layout and the prompt page rely on. Only ProjectTree
// (which does need onSnapshot wiring) is replaced with a stub.
vi.mock("../features/workspace", async () => {
  const real = await import("../features/workspace/ActivePromptHeader");
  return {
    ActivePromptHeaderProvider: real.ActivePromptHeaderProvider,
    useActivePromptHeader: real.useActivePromptHeader,
    ProjectTree: ({ role }: { role: string | null }) => <div>tree for {role ?? "signed out"}</div>,
  };
});
// The header chip's own behavior (onSnapshot subscriptions, etc.) is covered by
// tests/use-cycle.test.tsx and its own component tests — stub it here so this layout test
// doesn't need real Firestore wiring just to render the page shell.
vi.mock("../features/cycle", () => ({
  CycleStatusChip: () => null,
}));
// The layout imports AuthGuard from its own file directly (not the features/auth index),
// so AuthGuard runs for real here — it only needs useAuth (mocked below, by file, matching
// AuthGuard's own "./useAuth" import) and next/navigation's useRouter (mocked above).
vi.mock("../features/auth/useAuth", () => ({
  useAuth: () => ({
    profile: { uid: "u1", email: "a@b.com", name: "A", role: "maintainer", createdAt: "x" },
    loading: false,
    signOut: vi.fn(),
  }),
}));

import { useEffect } from "react";
import WorkspaceLayout from "../app/(workspace)/layout";
import { useActivePromptHeader, type ActivePromptHeaderData } from "../features/workspace";

const BASE_HEADER: ActivePromptHeaderData = {
  projectName: "Support automation",
  promptName: "Ticket triage",
  tags: ["triage", "prod"],
  latestVersion: 2,
  isDirty: false,
  archived: false,
  canEdit: true,
  canSettings: true,
  onRename: () => undefined,
  onTagsChange: () => undefined,
  onToggleArchive: () => undefined,
  onRunOnce: () => undefined,
};

function renderWithHeader(header: ActivePromptHeaderData) {
  function PublishingChild() {
    const { setHeader } = useActivePromptHeader();
    useEffect(() => {
      setHeader(header);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setHeader]);
    return <p>content</p>;
  }
  return render(<WorkspaceLayout>{<PublishingChild />}</WorkspaceLayout>);
}

describe("WorkspaceLayout", () => {
  it("renders the signed-in user's name, role badge, and the tree for their role", () => {
    render(<WorkspaceLayout>{<p>content</p>}</WorkspaceLayout>);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("maintainer")).toBeInTheDocument();
    expect(screen.getByText("tree for maintainer")).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("falls back to the generic title when no prompt is active", () => {
    render(<WorkspaceLayout>{<p>content</p>}</WorkspaceLayout>);
    expect(screen.getByText("Prompt Evaluation Workbench")).toBeInTheDocument();
  });

  it("swaps the generic title for the active prompt's project/name/tags/version once a page publishes them", async () => {
    renderWithHeader(BASE_HEADER);
    expect(await screen.findByText("Project: Support automation")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ticket triage")).toBeInTheDocument();
    expect(screen.getByText("triage")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.queryByText("Prompt Evaluation Workbench")).not.toBeInTheDocument();
  });

  it("removes a tag via its × control, calling onTagsChange with that tag dropped", async () => {
    const onTagsChange = vi.fn();
    renderWithHeader({ ...BASE_HEADER, onTagsChange });
    await screen.findByText("triage");
    fireEvent.click(screen.getByRole("button", { name: "Remove tag triage" }));
    expect(onTagsChange).toHaveBeenCalledWith(["prod"]);
  });

  it("adds a tag typed into the '+ tag' input on Enter, calling onTagsChange with it appended", async () => {
    const onTagsChange = vi.fn();
    renderWithHeader({ ...BASE_HEADER, onTagsChange });
    const input = await screen.findByPlaceholderText("+ tag");
    fireEvent.change(input, { target: { value: "urgent" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onTagsChange).toHaveBeenCalledWith(["triage", "prod", "urgent"]);
  });

  it("shows tags read-only, with no remove control and no add input, when the header is not editable", async () => {
    renderWithHeader({ ...BASE_HEADER, canEdit: false });
    await screen.findByText("triage");
    expect(screen.queryByRole("button", { name: "Remove tag triage" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("+ tag")).not.toBeInTheDocument();
  });
});
