// web/tests/use-auth.test.tsx
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let authStateCallback: ((user: unknown) => void) | null = null;

vi.mock("../shared/firebase/client", () => ({
  auth: {},
}));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth, cb) => {
    authStateCallback = cb;
    return () => {};
  }),
  signOut: vi.fn(),
}));
vi.mock("../shared/api/client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../shared/api/client";
import { AuthProvider, useAuth } from "../features/auth/useAuth";

function Probe() {
  const { profile, loading } = useAuth();
  if (loading) return <p>loading</p>;
  return <p>{profile ? `signed in as ${profile.role}` : "signed out"}</p>;
}

beforeEach(() => {
  authStateCallback = null;
  vi.mocked(apiFetch).mockReset();
});

describe("useAuth", () => {
  it("starts in a loading state", () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("fetches /me and exposes the role once Firebase reports a signed-in user", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      uid: "u1", email: "a@b.com", name: "A", role: "maintainer", createdAt: "2026-09-05T00:00:00Z",
    });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await act(async () => {
      authStateCallback?.({ uid: "u1" });
    });
    await waitFor(() => expect(screen.getByText("signed in as maintainer")).toBeInTheDocument());
  });

  it("reports signed-out once Firebase reports no user", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await act(async () => {
      authStateCallback?.(null);
    });
    await waitFor(() => expect(screen.getByText("signed out")).toBeInTheDocument());
  });
});
