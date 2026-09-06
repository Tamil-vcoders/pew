"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Lock, Mail, UserCircle } from "lucide-react";
import { COLORS } from "@/shared/ui/tokens";
import { Btn } from "@/shared/ui/Btn";
import { resetPassword, signIn, signInWithGoogle, signUp } from "./authService";
import { useAuth } from "./useAuth";

type Mode = "signin" | "signup";

// The prototype's quick demo-account list (docs/prototype.jsx lines 553-566) is intentionally
// not shown here at all -- not even as a read-only visual list. Seeded demo credentials for
// manual role testing are documented in docs/demo-script.md instead.

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

      <div style={{ fontSize: 10.5, color: COLORS.faint, lineHeight: 1.6, marginTop: 18, textAlign: "center" }}>
        Signed in via Firebase Auth (email/password + Google); roles are read fresh from the
        workspace and enforced server-side by the API on every endpoint.
      </div>
    </div>
  );
}
