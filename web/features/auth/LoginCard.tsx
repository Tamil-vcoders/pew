// web/features/auth/LoginCard.tsx
"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { COLORS } from "@/shared/ui/tokens";
import { Btn } from "@/shared/ui/Btn";
import { resetPassword, signIn, signInWithGoogle, signUp } from "./authService";
import { useAuth } from "./useAuth";

type Mode = "signin" | "signup";

// Quick demo-account auto-login buttons from the prototype (docs/prototype.jsx lines
// 553-566) are intentionally NOT ported here. The prototype fakes authentication
// entirely ("no real authentication happens", prototype.jsx line 569); this build calls
// real Firebase Auth, so a one-click role switcher would be an actual auth bypass, not a
// prototype convenience. Instead we list the seeded demo accounts as plain text below the
// form so a human tester can still sign in manually as any role. This list (and the shared
// password) must never reach a production build, so it's gated behind
// NEXT_PUBLIC_USE_EMULATOR === "true" below; Next.js inlines NEXT_PUBLIC_* vars at build
// time, so as long as NEXT_PUBLIC_USE_EMULATOR is actually set to a literal value (not left
// unset) at build time, webpack can statically evaluate the check and dead-code-eliminate
// the whole block instead of shipping it. web/Dockerfile declares an ARG/ENV pair for this
// var with a "false" default, so `docker build` always gets a concrete value here — including
// a bare `docker build .` with no --build-arg passed — but a from-scratch `npm run build`
// invocation that doesn't set the env var will NOT eliminate this block; always set
// NEXT_PUBLIC_USE_EMULATOR explicitly when building for production outside the Dockerfile.
const DEMO_ACCOUNTS = [
  "asha@acme.dev (administrator)",
  "vikram@acme.dev (maintainer)",
  "meera@acme.dev (contributor)",
  "dev@acme.dev (viewer)",
];

export function LoginCard() {
  const router = useRouter();
  const { profile } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Redirect once the auth context actually observes a signed-in profile, rather than
  // immediately after the raw Firebase SDK call resolves. signIn()/signUp()/signInWithGoogle()
  // resolving does NOT mean useAuth()'s onAuthStateChanged listener has fired yet -- that's a
  // separate, slightly-later async notification. Navigating on the raw promise raced against
  // that listener: AuthGuard on "/" reads the same `profile` from this same context, and if it
  // hadn't updated yet by the time the navigation landed, AuthGuard saw stale
  // signed-out state and bounced straight back to /login. Gating the redirect on `profile`
  // itself ties both places to the same state, so they can't disagree.
  useEffect(() => {
    if (profile) {
      router.push("/");
    }
  }, [profile, router]);

  async function submit() {
    setError(null);
    setMessage(null);
    try {
      if (mode === "signup") {
        if (password !== confirmPassword) {
          setError("Passwords do not match.");
          return;
        }
        if (password.length < 8) {
          setError("Password must be at least 8 characters.");
          return;
        }
        await signUp(name, email, password);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function google() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function reset() {
    setError(null);
    setMessage(null);
    if (!email) {
      setError("Enter your email above first.");
      return;
    }
    try {
      await resetPassword(email);
      setMessage(`Password reset email sent to ${email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "0 auto", padding: 24, color: COLORS.text }}>
      <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Prompt Evaluation Workbench</div>
      <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 14 }}>
        {mode === "signin" ? "Sign in to your workspace" : "Create your account"}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <button
          aria-label="Switch to sign in"
          aria-pressed={mode === "signin"}
          onClick={() => setMode("signin")}
          style={{ fontWeight: mode === "signin" ? 700 : 400, color: mode === "signin" ? COLORS.text : COLORS.muted }}
        >
          Sign in
        </button>
        <button
          aria-label="Switch to sign up"
          aria-pressed={mode === "signup"}
          onClick={() => setMode("signup")}
          style={{ fontWeight: mode === "signup" ? 700 : 400, color: mode === "signup" ? COLORS.text : COLORS.muted }}
        >
          Sign up
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {mode === "signup" && (
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10.5, color: COLORS.faint }}>
            Full name
            <input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10.5, color: COLORS.faint }}>
          Email
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10.5, color: COLORS.faint }}>
          Password
          <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {mode === "signup" && (
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10.5, color: COLORS.faint }}>
            Confirm password
            <input
              placeholder="Confirm password" type="password" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </label>
        )}
        {error && <div style={{ fontSize: 11.5, color: COLORS.bad }}>{error}</div>}
        {message && <div style={{ fontSize: 11.5, color: COLORS.good }}>{message}</div>}
        <Btn onClick={submit}>{mode === "signin" ? "Sign in" : "Create account"}</Btn>
        {mode === "signin" && (
          <button onClick={reset} style={{ background: "none", border: "none", color: COLORS.accent, textAlign: "left" }}>
            Forgot password?
          </button>
        )}
      </div>

      <div style={{ margin: "14px 0", fontSize: 10.5, color: COLORS.faint, textAlign: "center" }}>or</div>
      <Btn tone="ghost" onClick={google}>
        Continue with Google
      </Btn>

      {process.env.NEXT_PUBLIC_USE_EMULATOR === "true" && (
        <div style={{ marginTop: 16, fontSize: 10.5, color: COLORS.faint, lineHeight: 1.7 }}>
          Seeded demo accounts for role testing (password: &quot;correct horse battery staple&quot;):
          <ul>
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account}>{account}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
