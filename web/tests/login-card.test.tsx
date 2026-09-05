// web/tests/login-card.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../features/auth/authService", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signInWithGoogle: vi.fn(),
  resetPassword: vi.fn(),
}));
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import * as authService from "../features/auth/authService";
import { LoginCard } from "../features/auth/LoginCard";

beforeEach(() => {
  vi.mocked(authService.signIn).mockReset();
  vi.mocked(authService.signUp).mockReset();
  pushMock.mockReset();
});

describe("LoginCard", () => {
  it("calls signIn and redirects to the workspace on success", async () => {
    vi.mocked(authService.signIn).mockResolvedValue({} as never);
    render(<LoginCard />);
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "hunter22" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await vi.waitFor(() => expect(authService.signIn).toHaveBeenCalledWith("a@b.com", "hunter22"));
    await vi.waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
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

  it("lists the seeded demo accounts for manual role testing", () => {
    render(<LoginCard />);
    expect(screen.getByText(/asha@acme\.dev/)).toBeInTheDocument();
    expect(screen.getByText(/dev@acme\.dev/)).toBeInTheDocument();
  });
});
