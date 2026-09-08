// web/tests/workspace-home.test.tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("../features/auth/useAuth", () => ({ useAuth: vi.fn() }));

import { useAuth } from "../features/auth/useAuth";
import { rememberLastPrompt } from "../features/workspace/lastPrompt";
import WorkspaceHome from "../app/(workspace)/page";

beforeEach(() => {
  localStorage.clear();
  replace.mockReset();
  vi.mocked(useAuth).mockReturnValue({
    firebaseUser: null, loading: false, signOut: vi.fn(), refreshProfile: vi.fn(),
    profile: { uid: "u1", email: "a@b.com", name: "A", role: "contributor" as never, createdAt: "x" },
  });
});

describe("WorkspaceHome", () => {
  it("shows the pick-a-prompt hint when the user has not opened a prompt before", () => {
    render(<WorkspaceHome />);
    expect(screen.getByText(/Select a prompt from the tree/)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to the user's last opened prompt (e.g. coming back from Global settings)", () => {
    rememberLastPrompt("u1", "j1", "p1");
    render(<WorkspaceHome />);
    expect(replace).toHaveBeenCalledWith("/p/p1?project=j1");
    expect(screen.queryByText(/Select a prompt from the tree/)).not.toBeInTheDocument();
  });

  it("does not redirect to another user's remembered prompt", () => {
    rememberLastPrompt("someone-else", "j1", "p1");
    render(<WorkspaceHome />);
    expect(replace).not.toHaveBeenCalled();
  });
});
