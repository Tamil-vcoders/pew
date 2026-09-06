// web/features/settings-global/DangerZoneSection.tsx — ports docs/prototype.jsx:721-728.
// The prototype's onDeleteAccount is a mock (removes membership, signs out); here it calls the
// real DELETE /me → revokes sessions, deletes the Firebase user, anonymizes the Firestore doc
// server-side — then signs out client-side and redirects to /login.
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, useToast } from "@/shared/ui";
import { signOutUser } from "@/features/auth/authService";
import { inputStyle } from "./fields";
import { Section } from "./Section";
import { settingsApi } from "./settingsApi";

export function DangerZoneSection() {
  const router = useRouter();
  const { showError } = useToast();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    setDeleting(true);
    try {
      await settingsApi.deleteAccount();
      await signOutUser();
      router.push("/login");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete account.");
      setDeleting(false);
    }
  }

  return (
    <Section
      title="Danger zone"
      note="This revokes your sessions, deletes your sign-in, and anonymizes your account record (name and email cleared, role reset). Audit entries referencing you are retained — audit is append-only by design."
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Type DELETE to confirm"
          style={{ ...inputStyle, width: 190, fontSize: 11.5, fontFamily: "ui-monospace, monospace" }}
        />
        <Btn tone="danger" disabled={confirmText !== "DELETE" || deleting} onClick={onDelete}>
          {deleting ? "Deleting…" : "Delete my account"}
        </Btn>
      </div>
    </Section>
  );
}
