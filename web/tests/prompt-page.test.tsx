// web/tests/prompt-page.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useSearchParams: vi.fn() }));
vi.mock("../features/workspace", () => ({
  usePromptDoc: vi.fn(),
  workspaceApi: { updatePrompt: vi.fn() },
}));
vi.mock("../features/auth/useAuth", () => ({ useAuth: vi.fn() }));

import { useSearchParams } from "next/navigation";
import { usePromptDoc, workspaceApi } from "../features/workspace";
import { useAuth } from "../features/auth/useAuth";
import PromptPage from "../app/(workspace)/p/[promptId]/page";

const basePrompt = {
  id: "p1",
  projectId: "j1",
  name: "Ticket triage",
  tags: ["draft"],
  archived: false,
  bestScore: null,
  latestVersion: 1,
};

function setup(role: string | null, promptOverrides: Partial<typeof basePrompt> = {}) {
  vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("project=j1") as never);
  vi.mocked(useAuth).mockReturnValue({
    firebaseUser: null,
    loading: false,
    signOut: vi.fn(),
    profile: role
      ? { uid: "u1", email: "a@b.com", name: "A", role: role as never, createdAt: "x" }
      : null,
  });
  vi.mocked(usePromptDoc).mockReturnValue({ data: { ...basePrompt, ...promptOverrides }, error: null });
  return render(<PromptPage params={{ promptId: "p1" }} />);
}

beforeEach(() => {
  vi.mocked(usePromptDoc).mockReset();
  vi.mocked(useAuth).mockReset();
  vi.mocked(useSearchParams).mockReset();
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

  it("shows an editable (non-readOnly) name input and still no Archive button for a contributor", () => {
    setup("contributor");
    const input = screen.getByDisplayValue("Ticket triage");
    expect(input).not.toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: /archive/i })).not.toBeInTheDocument();
  });

  it("shows an editable name input and an Archive button for a maintainer, which calls updatePrompt with archived:true", () => {
    setup("maintainer");
    const input = screen.getByDisplayValue("Ticket triage");
    expect(input).not.toHaveAttribute("readonly");

    const button = screen.getByRole("button", { name: "Archive" });
    fireEvent.click(button);
    expect(workspaceApi.updatePrompt).toHaveBeenCalledWith("j1", "p1", { archived: true });
  });

  it("shows an Unarchive button for an already-archived prompt and calls updatePrompt with archived:false", () => {
    setup("maintainer", { archived: true });
    const button = screen.getByRole("button", { name: "Unarchive" });
    fireEvent.click(button);
    expect(workspaceApi.updatePrompt).toHaveBeenCalledWith("j1", "p1", { archived: false });
  });

  it("buffers the name input locally and commits exactly one updatePrompt call on blur", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    setup("maintainer");
    const input = screen.getByDisplayValue("Ticket triage") as HTMLInputElement;

    await userEvent.clear(input);
    await userEvent.type(input, "Renamed prompt");
    expect(input.value).toBe("Renamed prompt");
    expect(workspaceApi.updatePrompt).not.toHaveBeenCalled();

    fireEvent.blur(input);
    await vi.waitFor(() => expect(workspaceApi.updatePrompt).toHaveBeenCalledTimes(1));
    expect(workspaceApi.updatePrompt).toHaveBeenCalledWith("j1", "p1", { name: "Renamed prompt" });
  });

  it("shows a loading state while the prompt hasn't loaded yet", () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("project=j1") as never);
    vi.mocked(useAuth).mockReturnValue({
      firebaseUser: null,
      loading: false,
      signOut: vi.fn(),
      profile: { uid: "u1", email: "a@b.com", name: "A", role: "viewer" as never, createdAt: "x" },
    });
    vi.mocked(usePromptDoc).mockReturnValue({ data: null, error: null });
    render(<PromptPage params={{ promptId: "p1" }} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an inline error message instead of the form when the prompt stream errors", () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("project=j1") as never);
    vi.mocked(useAuth).mockReturnValue({
      firebaseUser: null,
      loading: false,
      signOut: vi.fn(),
      profile: { uid: "u1", email: "a@b.com", name: "A", role: "viewer" as never, createdAt: "x" },
    });
    vi.mocked(usePromptDoc).mockReturnValue({ data: null, error: new Error("permission-denied") });
    render(<PromptPage params={{ promptId: "p1" }} />);
    expect(screen.getByText("permission-denied")).toBeInTheDocument();
  });
});
