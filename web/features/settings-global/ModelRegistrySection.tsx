// web/features/settings-global/ModelRegistrySection.tsx — ports docs/prototype.jsx:656-678.
// The prototype's rate inputs are pure local mock state; here each row commits to
// PATCH /admin/model-registry on blur/change, buffering rate-field edits locally first (same
// local-buffer-then-commit pattern as ProjectTree's rename input) so a request isn't fired per
// keystroke. No "provider" column — v1 is Gemini-only (devspec §1.2), so the prototype's
// provider field is omitted rather than inventing one for an out-of-scope feature.
"use client";
import { useEffect, useState } from "react";
import { COLORS, useToast } from "@/shared/ui";
import { requiresRoleCaption, type Capabilities } from "@/shared/rbac/permissions";
import type { ModelRates, ModelRegistry } from "@/shared/types";
import { inputStyle } from "./fields";
import { Section } from "./Section";
import { settingsApi } from "./settingsApi";

function RateRow({
  modelId,
  rates,
  disabled,
  onPatch,
}: {
  modelId: string;
  rates: ModelRates;
  disabled: boolean;
  onPatch: (fields: { rateInPer1M?: number; rateOutPer1M?: number; enabled?: boolean }) => void;
}) {
  const [inDraft, setInDraft] = useState(String(rates.rateInPer1M));
  const [outDraft, setOutDraft] = useState(String(rates.rateOutPer1M));
  useEffect(() => setInDraft(String(rates.rateInPer1M)), [rates.rateInPer1M]);
  useEffect(() => setOutDraft(String(rates.rateOutPer1M)), [rates.rateOutPer1M]);

  function commitIn() {
    const v = Number(inDraft);
    if (!Number.isNaN(v) && v !== rates.rateInPer1M) onPatch({ rateInPer1M: v });
  }
  function commitOut() {
    const v = Number(outDraft);
    if (!Number.isNaN(v) && v !== rates.rateOutPer1M) onPatch({ rateOutPer1M: v });
  }

  return (
    <div
      key={modelId}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 6, background: COLORS.surface2, fontSize: 12 }}
    >
      <span style={{ flex: 1 }}>{rates.label}</span>
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: COLORS.faint }}>$/1M in</span>
      <input
        type="number" step="0.5" min="0" disabled={disabled} value={inDraft}
        onChange={(e) => setInDraft(e.target.value)} onBlur={commitIn}
        style={{ ...inputStyle, width: 62, padding: "3px 6px", fontSize: 11, fontFamily: "ui-monospace, monospace" }}
      />
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: COLORS.faint }}>out</span>
      <input
        type="number" step="0.5" min="0" disabled={disabled} value={outDraft}
        onChange={(e) => setOutDraft(e.target.value)} onBlur={commitOut}
        style={{ ...inputStyle, width: 62, padding: "3px 6px", fontSize: 11, fontFamily: "ui-monospace, monospace" }}
      />
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: COLORS.muted, cursor: disabled ? "default" : "pointer" }}>
        <input
          type="checkbox" checked={rates.enabled} disabled={disabled}
          onChange={(e) => onPatch({ enabled: e.target.checked })}
        />
        enabled
      </label>
    </div>
  );
}

export function ModelRegistrySection({
  registry,
  onChange,
  can,
}: {
  registry: ModelRegistry;
  onChange: (next: ModelRegistry) => void;
  can: Capabilities;
}) {
  const { showError } = useToast();
  const [pending, setPending] = useState<Record<string, boolean>>({});

  async function patch(modelId: string, fields: { rateInPer1M?: number; rateOutPer1M?: number; enabled?: boolean }) {
    setPending((p) => ({ ...p, [modelId]: true }));
    try {
      const { modelId: updatedId, ...rates } = await settingsApi.patchModelRegistry(modelId, fields);
      onChange({ ...registry, [updatedId]: rates });
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update the model registry.");
    } finally {
      setPending((p) => ({ ...p, [modelId]: false }));
    }
  }

  return (
    <Section
      title="Model registry"
      note={
        can.settings
          ? "Rates feed every project's estimator. Disabled models disappear from per-stage dropdowns (existing assignments keep working but are flagged)."
          : requiresRoleCaption("maintainer")
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {Object.entries(registry).map(([modelId, rates]) => (
          <RateRow
            key={modelId}
            modelId={modelId}
            rates={rates}
            disabled={!can.settings || !!pending[modelId]}
            onPatch={(fields) => patch(modelId, fields)}
          />
        ))}
      </div>
    </Section>
  );
}
