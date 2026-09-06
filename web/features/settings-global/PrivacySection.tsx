// web/features/settings-global/PrivacySection.tsx — ports docs/prototype.jsx:701-719.
// Deliberate deviation from the prototype (per the plan, matching AC-11.1/11.2's
// server-side-role premise): the prototype lets any signed-in user flip retention; here the
// write path (PATCH /admin/privacy) is administrator-only, so this renders read-only with a
// role caption for everyone else instead.
"use client";
import { useState } from "react";
import { COLORS, useToast } from "@/shared/ui";
import { requiresRoleCaption, type Capabilities } from "@/shared/rbac/permissions";
import type { PrivacySettings } from "@/shared/types";
import { inputStyle } from "./fields";
import { Section } from "./Section";
import { settingsApi } from "./settingsApi";

export function PrivacySection({
  privacy,
  onChange,
  can,
}: {
  privacy: PrivacySettings;
  onChange: (next: PrivacySettings) => void;
  can: Capabilities;
}) {
  const { showError } = useToast();
  const [busy, setBusy] = useState(false);
  const editable = can.admin;

  async function patch(fields: Partial<PrivacySettings>) {
    setBusy(true);
    try {
      const next = await settingsApi.patchPrivacy(fields);
      onChange(next);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update privacy settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Privacy"
      note={
        editable
          ? "Per the PRD: prompt text, test case content, model output, and grader reasoning are excluded from logs and analytics — that exclusion is not configurable. Scores and metadata are retained indefinitely."
          : requiresRoleCaption("administrator")
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, flex: 1 }}>Run artifact retention (then hard-deleted on schedule)</span>
          <select
            value={String(privacy.retentionDays)}
            disabled={!editable || busy}
            onChange={(e) => patch({ retentionDays: Number(e.target.value) })}
            style={{ ...inputStyle, width: 110, padding: "4px 6px", fontSize: 11, fontFamily: "ui-monospace, monospace" }}
          >
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="180">180 days</option>
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, flex: 1 }}>Prompt &amp; output content in analytics</span>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: COLORS.faint }}>always excluded</span>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: editable ? "pointer" : "default" }}>
          <span style={{ fontSize: 12, flex: 1 }}>Share anonymous usage metrics (counts and costs only)</span>
          <input
            type="checkbox" checked={privacy.telemetry} disabled={!editable || busy}
            onChange={(e) => patch({ telemetry: e.target.checked })}
          />
        </label>
      </div>
    </Section>
  );
}
