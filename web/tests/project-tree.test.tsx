// web/tests/project-tree.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const mockProjects = [
  { id: "j1", name: "Support automation", cfg: {} as never },
];
const mockPrompts: Record<string, Array<{ id: string; projectId: string; name: string; tags: string[]; archived: boolean; bestScore: number | null; latestVersion: number }>> = {
  j1: [
    { id: "p1", projectId: "j1", name: "Ticket triage", tags: ["triage", "prod"], archived: false, bestScore: null, latestVersion: 1 },
    { id: "p2", projectId: "j1", name: "Old draft", tags: [], archived: true, bestScore: null, latestVersion: 1 },
  ],
};

vi.mock("../features/workspace/useProjectsStream", () => ({ useProjectsStream: () => mockProjects }));
vi.mock("../features/workspace/usePromptsStream", () => ({
  usePromptsStream: (projectId: string) => mockPrompts[projectId] ?? [],
}));
vi.mock("../features/workspace/workspaceApi", () => ({
  workspaceApi: { createProject: vi.fn(), createPrompt: vi.fn(), renameProject: vi.fn() },
}));

import { ProjectTree } from "../features/workspace/ProjectTree";

describe("ProjectTree", () => {
  it("shows non-archived prompts by default and hides the archived one", () => {
    render(<ProjectTree role="contributor" activePromptId={null} />);
    expect(screen.getByText("Ticket triage")).toBeInTheDocument();
    expect(screen.queryByText("Old draft")).not.toBeInTheDocument();
  });

  it("reveals archived prompts once 'show archived' is checked", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    render(<ProjectTree role="contributor" activePromptId={null} />);
    await userEvent.click(screen.getByLabelText("show archived"));
    expect(screen.getByText("Old draft")).toBeInTheDocument();
  });

  it("filters by name or tag as the search box changes", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    render(<ProjectTree role="contributor" activePromptId={null} />);
    await userEvent.type(screen.getByPlaceholderText("name or tag…"), "prod");
    expect(screen.getByText("Ticket triage")).toBeInTheDocument();
    await userEvent.clear(screen.getByPlaceholderText("name or tag…"));
    await userEvent.type(screen.getByPlaceholderText("name or tag…"), "nomatch");
    expect(screen.queryByText("Ticket triage")).not.toBeInTheDocument();
  });

  it("hides 'new project' for a viewer and shows it for a maintainer", () => {
    const { rerender } = render(<ProjectTree role="viewer" activePromptId={null} />);
    expect(screen.queryByTitle("New project")).not.toBeInTheDocument();
    rerender(<ProjectTree role="maintainer" activePromptId={null} />);
    expect(screen.getByTitle("New project")).toBeInTheDocument();
  });

  it("hides 'new prompt' for a viewer and shows it for a contributor", () => {
    const { rerender } = render(<ProjectTree role="viewer" activePromptId={null} />);
    expect(screen.queryByTitle("New prompt in this project")).not.toBeInTheDocument();
    rerender(<ProjectTree role="contributor" activePromptId={null} />);
    expect(screen.getByTitle("New prompt in this project")).toBeInTheDocument();
  });

  it("shows an editable project name input for a maintainer and static text for a contributor", () => {
    const { rerender } = render(<ProjectTree role="contributor" activePromptId={null} />);
    expect(screen.getByText("Support automation")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Support automation")).not.toBeInTheDocument();
    rerender(<ProjectTree role="maintainer" activePromptId={null} />);
    expect(screen.getByDisplayValue("Support automation")).toBeInTheDocument();
  });
});
