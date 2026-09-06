// web/features/settings-global/SecuritySection.tsx — ports docs/prototype.jsx:618-630 with
// the prototype's mock password/reset calls replaced by real Firebase client calls
// (authService.changePassword / authService.resetPassword). The Google-linked note is driven
// off firebaseUser.providerData, exactly as noted in the plan.
"use client";
import { useState } from "react";
import { Btn, COLORS, useToast } from "@/shared/ui";
import { useAuth } from "@/features/auth/useAuth";
import { changePassword, resetPassword } from "@/features/auth/authService";
import { Field, inputStyle } from "./fields";
import { Section } from "./Section";

type SecMsg = { t: "ok" | "err"; m: string };

export function SecuritySection() {
  const { firebaseUser } = useAuth();
  const { showError } = useToast();
  const [pwCur, setPwCur] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConf, setPwConf] = useState("");
  const [secMsg, setSecMsg] = useState<SecMsg | null>(null);
  const [busy, setBusy] = useState(false);

  const isGoogleLinked = firebaseUser?.providerData.some((p) => p.providerId === "google.com") ?? false;

  async function submitChangePassword() {
    setSecMsg(null);
    if (pwNew.length < 8) {
      setSecMsg({ t: "err", m: "New password must be at least 8 characters." });
      return;
    }
    if (pwNew !== pwConf) {
      setSecMsg({ t: "err", m: "New passwords do not match." });
      return;
    }
    setBusy(true);
    try {
      await changePassword(pwCur, pwNew);
      setPwCur("");
      setPwNew("");
      setPwConf("");
      setSecMsg({ t: "ok", m: "Password updated." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update password.";
      setSecMsg({ t: "err", m: message });
      showError(message);
    } finally {
      setBusy(false);
    }
  }

  async function sendReset() {
    setSecMsg(null);
    if (!firebaseUser?.email) return;
    try {
      await resetPassword(firebaseUser.email);
      setSecMsg({ t: "ok", m: `Password reset email sent to ${firebaseUser.email}.` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send reset email.";
      setSecMsg({ t: "err", m: message });
      showError(message);
    }
  }

  return (
    <Section
      title="Security"
      note={
        isGoogleLinked
          ? "This account signs in with Google — manage your password with Google. Sensitive changes also revoke refresh tokens."
          : "Sensitive changes also revoke refresh tokens."
      }
    >
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Field label="Current password">
          <input
            type="password" value={pwCur} onChange={(e) => setPwCur(e.target.value)}
            autoComplete="new-password" disabled={isGoogleLinked || busy} style={inputStyle}
          />
        </Field>
        <Field label="New password">
          <input
            type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)}
            autoComplete="new-password" disabled={isGoogleLinked || busy} style={inputStyle}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type="password" value={pwConf} onChange={(e) => setPwConf(e.target.value)}
            autoComplete="new-password" disabled={isGoogleLinked || busy} style={inputStyle}
          />
        </Field>
      </div>
      {secMsg && (
        <div style={{ fontSize: 11.5, color: secMsg.t === "ok" ? COLORS.good : COLORS.bad, marginTop: 8 }}>
          {secMsg.m}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <Btn disabled={busy || isGoogleLinked} onClick={submitChangePassword}>
          Update password
        </Btn>
        <Btn tone="ghost" onClick={sendReset}>
          Send reset email
        </Btn>
      </div>
    </Section>
  );
}
