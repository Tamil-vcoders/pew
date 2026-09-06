// web/tests/workspace-layout.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/p/p1",
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("../features/workspace", () => ({
  ProjectTree: ({ role }: { role: string | null }) => <div>tree for {role ?? "signed out"}</div>,
}));
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

import WorkspaceLayout from "../app/(workspace)/layout";

describe("WorkspaceLayout", () => {
  it("renders the signed-in user's name, role badge, and the tree for their role", () => {
    render(<WorkspaceLayout>{<p>content</p>}</WorkspaceLayout>);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("maintainer")).toBeInTheDocument();
    expect(screen.getByText("tree for maintainer")).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
