// web/features/settings-global/ProfileSection.tsx — ports docs/prototype.jsx:604-616.
// The prototype's `syncName` commits on every keystroke (a pure-mock local state update); with
// a real PATCH /me round-trip that would fire a request per keystroke, so — matching the
// established local-buffer-then-commit-on-blur pattern already used for renames in
// web/features/workspace/ProjectTree.tsx and web/app/(workspace)/p/[promptId]/page.tsx — this
// buffers the draft locally and commits once on blur.
"use client";
import { useEffect, useState } from "react";
import { COLORS, RoleBadge, useToast } from "@/shared/ui";
import { useAuth } from "@/features/auth/useAuth";
import type { User } from "@/shared/types";
import { Field, inputStyle } from "./fields";
import { Section } from "./Section";
import { settingsApi } from "./settingsApi";

export function ProfileSection({ profile }: { profile: User }) {
  const { refreshProfile } = useAuth();
  const { showError } = useToast();
  const [nameDraft, setNameDraft] = useState(profile.name);
  useEffect(() => setNameDraft(profile.name), [profile.name]);
  const [saving, setSaving] = useState(false);

  async function commitName() {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === profile.name) {
      setNameDraft(profile.name);
      return;
    }
    setSaving(true);
    try {
      await settingsApi.updateProfileName(trimmed);
      await refreshProfile();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update display name.");
      setNameDraft(profile.name);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Profile">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Field label="Display name">
          <input
            value={nameDraft}
            disabled={saving}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            style={inputStyle}
          />
        </Field>
        <Field label="Email (identity — managed by the auth provider)">
          <input value={profile.email} readOnly style={{ ...inputStyle, color: COLORS.faint }} />
        </Field>
        <Field label="Role (assigned by an administrator)">
          <div style={{ paddingTop: 6 }}>
            <RoleBadge role={profile.role} />
          </div>
        </Field>
      </div>
    </Section>
  );
}
