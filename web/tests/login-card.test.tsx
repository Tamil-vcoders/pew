// web/tests/login-card.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../features/auth/authService", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signInWithGoogle: vi.fn(),
  resetPassword: vi.fn(),
}));
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

// `useAuth()`'s `profile` drives LoginCard's post-sign-in redirect (see LoginCard.tsx) --
// tests control it via this module-level variable so they can simulate the real sequence:
// the raw Firebase call resolving is NOT the same moment `profile` actually updates.
let mockProfile: { uid: string; role: string } | null = null;
vi.mock("../features/auth/useAuth", () => ({
  useAuth: () => ({ profile: mockProfile }),
}));

import * as authService from "../features/auth/authService";
import { LoginCard } from "../features/auth/LoginCard";

beforeEach(() => {
  vi.mocked(authService.signIn).mockReset();
  vi.mocked(authService.signUp).mockReset();
  pushMock.mockReset();
  mockProfile = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("LoginCard", () => {
  it("calls signIn, and redirects to the workspace once useAuth's profile updates", async () => {
    vi.mocked(authService.signIn).mockResolvedValue({} as never);
    const { rerender } = render(<LoginCard />);
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "hunter22" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await vi.waitFor(() => expect(authService.signIn).toHaveBeenCalledWith("a@b.com", "hunter22"));
    mockProfile = { uid: "u1", role: "viewer" };
    rerender(<LoginCard />);
    await vi.waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
  });

  it("does NOT redirect just because signIn resolved -- only once the auth context's profile actually updates (regression test for the sign-in redirect race)", async () => {
    // Reproduces a real production bug: signIn()/signUp()/signInWithGoogle() resolving does
    // not mean useAuth()'s onAuthStateChanged listener has fired yet. Navigating on the raw
    // promise raced against that listener, so AuthGuard (reading the same, not-yet-updated
    // `profile`) bounced the user straight back to /login. This test fails if LoginCard ever
    // reverts to calling router.push("/") directly after signIn()/signUp() resolves instead of
    // reacting to `profile`.
    vi.mocked(authService.signIn).mockResolvedValue({} as never);
    render(<LoginCard />);
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "hunter22" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await vi.waitFor(() => expect(authService.signIn).toHaveBeenCalledWith("a@b.com", "hunter22"));
    // profile is still null here (onAuthStateChanged "hasn't fired yet") -- must not navigate.
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows a validation error instead of calling signUp when passwords don't match", async () => {
    render(<LoginCard />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to sign up" }));
    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "A" } });
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "hunter22" } });
    fireEvent.change(screen.getByPlaceholderText("Confirm password"), { target: { value: "different" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
    expect(authService.signUp).not.toHaveBeenCalled();
  });

  it("surfaces the Firebase error message when sign-in fails", async () => {
    vi.mocked(authService.signIn).mockRejectedValue(new Error("Wrong password"));
    render(<LoginCard />);
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Wrong password")).toBeInTheDocument();
  });

  it("never shows demo account details, regardless of the emulator flag", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_EMULATOR", "true");
    render(<LoginCard />);
    expect(screen.queryByText("Asha")).not.toBeInTheDocument();
    expect(screen.queryByText(/quick demo accounts/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/asha@acme\.dev/)).not.toBeInTheDocument();
  });

  it("toggles password visibility", () => {
    render(<LoginCard />);
    const passwordInput = screen.getByLabelText(/^password$/i) as HTMLInputElement;
    expect(passwordInput.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(passwordInput.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(passwordInput.type).toBe("password");
  });

  it("gives every input an accessible label", () => {
    render(<LoginCard />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it("marks the active sign-in/sign-up tab with aria-pressed", () => {
    render(<LoginCard />);
    expect(screen.getByRole("button", { name: "Switch to sign in" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Switch to sign up" })).toHaveAttribute("aria-pressed", "false");
  });
});
