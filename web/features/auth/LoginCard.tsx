"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Lock, Mail, UserCircle } from "lucide-react";
import { COLORS, FONT_MONO, ROLE_COLOR } from "@/shared/ui/tokens";
import { Btn } from "@/shared/ui/Btn";
import { resetPassword, signIn, signInWithGoogle, signUp } from "./authService";
import { useAuth } from "./useAuth";

type Mode = "signin" | "signup";

// Quick demo-account auto-login buttons from the prototype (docs/prototype.jsx lines
// 553-566) are intentionally NOT ported as clickable, one-click-login controls. The
// prototype fakes authentication entirely ("no real authentication happens", prototype.jsx
// line 569); this build calls real Firebase Auth, so a one-click role switcher would be an
// actual auth bypass, not a prototype convenience. We DO port the visual design of that
// list (colored role chips) below, but every chip is inert (a plain <div>, not a <button>) --
// a human tester still has to type the email/password themselves. This list (and the shared
// password) must never reach a production build, so it's gated behind
// NEXT_PUBLIC_USE_EMULATOR === "true" below; Next.js inlines NEXT_PUBLIC_* vars at build
// time, so as long as NEXT_PUBLIC_USE_EMULATOR is actually set to a literal value (not left
// unset) at build time, webpack can statically evaluate the check and dead-code-eliminate
// the whole block instead of shipping it. web/Dockerfile declares an ARG/ENV pair for this
// var with a "false" default, so `docker build` always gets a concrete value here -- including
// a bare `docker build .` with no --build-arg passed -- but a from-scratch `npm run build`
// invocation that doesn't set the env var will NOT eliminate this block; always set
// NEXT_PUBLIC_USE_EMULATOR explicitly when building for production outside the Dockerfile.
const DEMO_ACCOUNTS = [
  { name: "Asha", email: "asha@acme.dev", role: "administrator" },
  { name: "Vikram", email: "vikram@acme.dev", role: "maintainer" },
  { name: "Meera", email: "meera@acme.dev", role: "contributor" },
  { name: "Dev", email: "dev@acme.dev", role: "viewer" },
] as const;

const inputStyle: React.CSSProperties = {
  background: "#0F1116",
  color: COLORS.text,
  border: `0.5px solid ${COLORS.border}`,
  borderRadius: 6,
  padding: "9px 8px",
  fontSize: 12.5,
  outline: "none",
  width: "100%",
};

function IconField({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "absolute", left: 9, top: 9, color: COLORS.faint, display: "flex" }}>{icon}</div>
      {children}
    </div>
  );
}

export function LoginCard() {
  const router = useRouter();
  const { profile } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <div style={{ maxWidth: 400, margin: "0 auto", padding: 24, color: COLORS.text }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: COLORS.accentDim,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <KeyRound size={26} color={COLORS.accent} />
        </div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, textAlign: "center", marginBottom: 4 }}>
        Prompt Evaluation Workbench
      </div>
      <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 18, textAlign: "center" }}>
        {mode === "signin" ? "Sign in to VCODERS AI LLP workspace" : "Create your account"}
      </div>

      <div
        style={{
          display: "flex",
          background: COLORS.surface2,
          borderRadius: 8,
          padding: 3,
          marginBottom: 18,
        }}
      >
        <button
          aria-label="Switch to sign in"
          aria-pressed={mode === "signin"}
          onClick={() => setMode("signin")}
          style={{
            flex: 1,
            background: mode === "signin" ? COLORS.surface : "transparent",
            border: mode === "signin" ? `0.5px solid ${COLORS.border}` : "none",
            borderRadius: 6,
            padding: "8px 0",
            fontSize: 13,
            fontWeight: 600,
            color: mode === "signin" ? COLORS.text : COLORS.faint,
            cursor: "pointer",
          }}
        >
          Sign in
        </button>
        <button
          aria-label="Switch to sign up"
          aria-pressed={mode === "signup"}
          onClick={() => setMode("signup")}
          style={{
            flex: 1,
            background: mode === "signup" ? COLORS.surface : "transparent",
            border: mode === "signup" ? `0.5px solid ${COLORS.border}` : "none",
            borderRadius: 6,
            padding: "8px 0",
            fontSize: 13,
            fontWeight: 600,
            color: mode === "signup" ? COLORS.text : COLORS.faint,
            cursor: "pointer",
          }}
        >
          Sign up
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {mode === "signup" && (
          <IconField icon={<UserCircle size={14} />}>
            <input
              aria-label="Full name"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 30 }}
            />
          </IconField>
        )}
        <IconField icon={<Mail size={14} />}>
          <input
            aria-label="Email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 30 }}
          />
        </IconField>
        <IconField icon={<Lock size={14} />}>
          <input
            aria-label="Password"
            placeholder="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 30, paddingRight: 34 }}
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((prev) => !prev)}
            style={{
              position: "absolute",
              right: 8,
              top: 7,
              background: "none",
              border: "none",
              color: COLORS.faint,
              cursor: "pointer",
              padding: 0,
              display: "flex",
            }}
          >
            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </IconField>
        {mode === "signup" && (
          <IconField icon={<Lock size={14} />}>
            <input
              aria-label="Confirm password"
              placeholder="Confirm password"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 30 }}
            />
          </IconField>
        )}
        {error && <div style={{ fontSize: 11.5, color: COLORS.bad }}>{error}</div>}
        {message && <div style={{ fontSize: 11.5, color: COLORS.good }}>{message}</div>}
        <Btn onClick={submit}>{mode === "signin" ? "Sign in" : "Create account"}</Btn>
        {mode === "signin" && (
          <button
            onClick={reset}
            style={{ background: "none", border: "none", color: COLORS.accent, textAlign: "left", cursor: "pointer", padding: 0, fontSize: 12.5 }}
          >
            Forgot password?
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
        <div style={{ flex: 1, height: 0.5, background: COLORS.border }} />
        <span style={{ fontSize: 11, color: COLORS.faint }}>or</span>
        <div style={{ flex: 1, height: 0.5, background: COLORS.border }} />
      </div>

      <button
        onClick={google}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          background: COLORS.surface,
          border: `0.5px solid ${COLORS.border}`,
          borderRadius: 8,
          padding: "10px 0",
          fontSize: 13.5,
          fontWeight: 600,
          color: COLORS.text,
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            background: "#fff",
            color: "#4285F4",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11.5,
            fontWeight: 700,
          }}
        >
          G
        </span>
        Continue with Google
      </button>

      {process.env.NEXT_PUBLIC_USE_EMULATOR === "true" && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, color: COLORS.faint, marginBottom: 8 }}>
            Quick demo accounts (for role testing):
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {DEMO_ACCOUNTS.map((account) => (
              <div
                key={account.email}
                title={account.email}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  border: `0.5px solid ${COLORS.border}`,
                  borderRadius: 6,
                  padding: "5px 9px",
                  fontSize: 12,
                  color: COLORS.muted,
                }}
              >
                {account.name}
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 10.5,
                    color: ROLE_COLOR[account.role],
                    background: `${ROLE_COLOR[account.role]}1F`,
                    border: `0.5px solid ${ROLE_COLOR[account.role]}55`,
                    borderRadius: 4,
                    padding: "1px 6px",
                  }}
                >
                  {account.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 10.5, color: COLORS.faint, lineHeight: 1.6, marginTop: 18, textAlign: "center" }}>
        Signed in via Firebase Auth (email/password + Google); roles are read fresh from the
        workspace and enforced server-side by the API on every endpoint.
      </div>
    </div>
  );
}
