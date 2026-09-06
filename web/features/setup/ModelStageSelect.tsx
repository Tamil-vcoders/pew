// web/features/setup/ModelStageSelect.tsx — replaces the free-text per-stage model input with
// a <select> sourced from the live model registry (devspec/prototype F11: "disabled models
// disappear from dropdowns; existing assignments keep working but are flagged"). Options are
// every *enabled* model plus the currently-assigned model even if it's since been disabled
// (labelled "— disabled", with a warning note below the row) — this is the one substantive,
// non-cosmetic change in this file per the Phase 5 plan.
import { COLORS } from "@/shared/ui";
import type { ModelRegistry } from "@/shared/types";

export function ModelStageSelect({
  registry,
  value,
  disabled,
  onChange,
}: {
  registry: ModelRegistry;
  value: string;
  disabled: boolean;
  onChange: (modelId: string) => void;
}) {
  const current = registry[value];
  const assignedIsDisabled = current != null && !current.enabled;
  const options = Object.entries(registry).filter(([id, m]) => m.enabled || id === value);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, width: 200 }}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "#0F1116", color: COLORS.text, border: `0.5px solid ${COLORS.border}`,
          borderRadius: 6, padding: "4px 6px", fontSize: 11.5, fontFamily: "ui-monospace, monospace", width: "100%",
        }}
      >
        {current == null && <option value={value}>{value}</option>}
        {options.map(([id, m]) => (
          <option key={id} value={id}>
            {m.label}
            {!m.enabled ? " — disabled" : ""}
          </option>
        ))}
      </select>
      {assignedIsDisabled && (
        <span style={{ fontSize: 10, color: COLORS.mid }}>
          This model was disabled in the model registry — existing runs keep using it.
        </span>
      )}
    </div>
  );
}
