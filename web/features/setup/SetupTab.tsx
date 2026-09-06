// web/features/setup/SetupTab.tsx — ports docs/prototype.jsx:1322-1439 (cycle defaults,
// grader weights, per-stage models, estimate + affordability warning, start-cycle button,
// cycle-ended card, cycle log).
"use client";
import { useEffect, useState } from "react";
import { Btn, COLORS } from "@/shared/ui";
import { EstimateTable, runsApi } from "@/features/runs";
import { CycleEndedCard, CycleLog, cycleApi } from "@/features/cycle";
import { workspaceApi } from "@/features/workspace";
import { settingsApi } from "@/features/settings-global";
import { ModelStageSelect } from "./ModelStageSelect";
import type { Capabilities } from "@/shared/rbac/permissions";
import type { Case, Cycle, Estimate, ModelRegistry, Project, Version } from "@/shared/types";

const inputStyle = {
  background: "#0F1116", color: COLORS.text, border: `0.5px solid ${COLORS.border}`,
  borderRadius: 6, padding: "6px 8px", fontSize: 12.5, outline: "none", width: "100%",
} as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 90 }}>
      <span style={{ fontSize: 10.5, color: COLORS.faint }}>{label}</span>
      {children}
    </label>
  );
}

const MODEL_STAGES: Array<[key: keyof Project["cfg"]["models"], label: string]> = [
  ["execution", "Target execution"],
  ["datasetGen", "Dataset generation"],
  ["grading", "Model grading"],
  ["suggestions", "Suggestion generation"],
];

export function SetupTab({
  projectId,
  promptId,
  promptName,
  project,
  draft,
  cases,
  versions,
  can,
  cycle,
  cycleIsHere,
  anyCycleActive,
  onCycleStarted,
  onNewCycleFromBest,
  onCycleCleared,
}: {
  projectId: string;
  promptId: string;
  promptName: string;
  project: Project;
  draft: string;
  cases: Case[];
  versions: Version[];
  can: Capabilities;
  cycle: Cycle | null;
  cycleIsHere: boolean;
  anyCycleActive: boolean;
  onCycleStarted: () => void;
  onNewCycleFromBest: (text: string) => void;
  onCycleCleared: () => void;
}) {
  const [cfg, setCfg] = useState(project.cfg);
  useEffect(() => setCfg(project.cfg), [project.cfg]);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [showEndedCard, setShowEndedCard] = useState(true);
  const [registry, setRegistry] = useState<ModelRegistry | null>(null);

  useEffect(() => {
    let cancelled = false;
    runsApi
      .estimate(projectId, promptId, draft)
      .then((est) => !cancelled && setEstimate(est))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectId, promptId, draft]);

  useEffect(() => {
    let cancelled = false;
    settingsApi
      .getModelRegistry()
      .then((r) => !cancelled && setRegistry(r))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function commitCfg(next: Project["cfg"]) {
    setCfg(next);
    if (!can.settings || anyCycleActive) return;
    try {
      setSaveError(null);
      await workspaceApi.updateCfg(projectId, next);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save project settings.");
    }
  }

  async function startCycle() {
    setStarting(true);
    try {
      setStartError(null);
      await cycleApi.start(projectId, promptId);
      onCycleStarted();
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Failed to start the cycle.");
    } finally {
      setStarting(false);
    }
  }

  const iterationsAffordable = estimate && estimate.totalCost > 0 ? Math.floor(cfg.budget / estimate.totalCost) : null;
  const locked = anyCycleActive || !can.settings;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {showEndedCard && cycleIsHere && cycle && cycle.status === "ended" && (
        <CycleEndedCard
          cycle={cycle}
          promptName={promptName}
          versions={versions}
          canEdit={can.edit}
          onNewCycleFromBest={onNewCycleFromBest}
          onClear={() => {
            setShowEndedCard(false);
            onCycleCleared();
          }}
        />
      )}

      {!can.settings && (
        <div style={{ fontSize: 11.5, color: COLORS.faint }}>Project setup requires the maintainer role — shown read-only.</div>
      )}
      {anyCycleActive && can.settings && (
        <div style={{ fontSize: 11.5, color: COLORS.faint }}>Project settings are locked while a cycle is active.</div>
      )}
      {saveError && <div style={{ fontSize: 11.5, color: COLORS.bad }}>{saveError}</div>}

      <div>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.muted, marginBottom: 8 }}>
          Cycle defaults — this project
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field label="Target score">
            <input
              type="number" step={0.5} min={1} max={10} disabled={locked} value={cfg.target}
              onChange={(e) => commitCfg({ ...cfg, target: Number(e.target.value) })}
              style={{ ...inputStyle, fontFamily: "ui-monospace, monospace" }}
            />
          </Field>
          <Field label="Max iterations">
            <input
              type="number" min={1} max={10} disabled={locked} value={cfg.maxIter}
              onChange={(e) => commitCfg({ ...cfg, maxIter: Number(e.target.value) })}
              style={{ ...inputStyle, fontFamily: "ui-monospace, monospace" }}
            />
          </Field>
          <Field label="Budget cap ($)">
            <input
              type="number" step={0.05} min={0.01} disabled={locked} value={cfg.budget}
              onChange={(e) => commitCfg({ ...cfg, budget: Number(e.target.value) })}
              style={{ ...inputStyle, fontFamily: "ui-monospace, monospace" }}
            />
          </Field>
          <Field label="Suggestions / iteration">
            <input
              type="number" min={1} max={4} disabled={locked} value={cfg.nSug}
              onChange={(e) => commitCfg({ ...cfg, nSug: Math.max(1, Math.min(4, Number(e.target.value))) })}
              style={{ ...inputStyle, fontFamily: "ui-monospace, monospace" }}
            />
          </Field>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: COLORS.muted, cursor: locked ? "default" : "pointer", marginTop: 10 }}>
          <input
            type="checkbox" checked={cfg.auto} disabled={locked}
            onChange={(e) => commitCfg({ ...cfg, auto: e.target.checked })}
          />
          Auto mode — no pauses: dataset auto-approved, manual grading skipped, top-ranked suggestion applied, stops if the score goes flat
        </label>
      </div>

      <div>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.muted, marginBottom: 8 }}>Grader weights (composite blend)</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field label="Code grader">
            <input
              type="number" step={0.1} min={0} max={2} disabled={locked} value={cfg.weights.code}
              onChange={(e) => commitCfg({ ...cfg, weights: { ...cfg.weights, code: Number(e.target.value) } })}
              style={{ ...inputStyle, fontFamily: "ui-monospace, monospace" }}
            />
          </Field>
          <Field label="Model grader">
            <input
              type="number" step={0.1} min={0} max={2} disabled={locked} value={cfg.weights.model}
              onChange={(e) => commitCfg({ ...cfg, weights: { ...cfg.weights, model: Number(e.target.value) } })}
              style={{ ...inputStyle, fontFamily: "ui-monospace, monospace" }}
            />
          </Field>
          <Field label="Human grader">
            <input
              type="number" step={0.1} min={0} max={2} disabled={locked} value={cfg.weights.human}
              onChange={(e) => commitCfg({ ...cfg, weights: { ...cfg.weights, human: Number(e.target.value) } })}
              style={{ ...inputStyle, fontFamily: "ui-monospace, monospace" }}
            />
          </Field>
        </div>
        <div style={{ fontSize: 11, color: COLORS.faint, marginTop: 6 }}>
          Human grades only affect cases you actually grade; ungraded cases blend code + model only.
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.muted, marginBottom: 8 }}>Models per stage</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 6, background: COLORS.surface, fontSize: 12 }}>
            <span style={{ flex: 1 }}>Prompt validation</span>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: COLORS.faint }}>static · no model · $0</span>
          </div>
          {MODEL_STAGES.map(([key, label]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderRadius: 6, background: COLORS.surface, fontSize: 12 }}>
              <span style={{ flex: 1 }}>{label}</span>
              {registry ? (
                <ModelStageSelect
                  registry={registry}
                  value={cfg.models[key]}
                  disabled={locked}
                  onChange={(modelId) => commitCfg({ ...cfg, models: { ...cfg.models, [key]: modelId } })}
                />
              ) : (
                <input
                  value={cfg.models[key]} disabled readOnly
                  style={{ ...inputStyle, width: 200, padding: "4px 6px", fontSize: 11.5, fontFamily: "ui-monospace, monospace" }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.muted, marginBottom: 8 }}>
          Estimated spend for &quot;{promptName}&quot; ({cases.length} cases · planning figures, not quotes)
        </div>
        {estimate ? <EstimateTable estimate={estimate} /> : <div style={{ fontSize: 11.5, color: COLORS.faint }}>Loading estimate…</div>}
        {iterationsAffordable != null && iterationsAffordable < cfg.maxIter && (
          <div style={{ fontSize: 11.5, color: COLORS.mid, marginTop: 8 }}>
            Budget ${cfg.budget.toFixed(2)} covers only ~{iterationsAffordable} of {cfg.maxIter} configured iterations
            (execution + grading only — suggestion-drafting cost adds a small amount per iteration on top).
          </div>
        )}
      </div>

      {can.edit && (
        <div>
          {startError && <div style={{ fontSize: 11.5, color: COLORS.bad, marginBottom: 8 }}>{startError}</div>}
          <Btn disabled={starting || anyCycleActive} onClick={startCycle}>
            {starting ? "Starting…" : `Start cycle on "${promptName}"`}
          </Btn>
        </div>
      )}

      {cycle && cycleIsHere && <CycleLog log={cycle.log} />}
    </div>
  );
}
