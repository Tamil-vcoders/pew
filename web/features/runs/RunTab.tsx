// web/features/runs/RunTab.tsx — ports docs/prototype.jsx:1502-1647 (score summary,
// streaming case rows with expand-to-detail, pre-run estimate banner).
"use client";
import { useState } from "react";
import { Btn, COLORS, ScoreBadge } from "@/shared/ui";
import { requiresRoleCaption, type Capabilities } from "@/shared/rbac/permissions";
import type { CaseResult, Estimate } from "@/shared/types";
import { EstimateTable } from "./EstimateTable";
import { runsApi } from "./runsApi";
import { useRunStream } from "./useRunStream";
import { blendCase, blendRun, type Weights } from "./blend";

function CaseDetailRow({
  projectId,
  promptId,
  runId,
  caseResult,
  weights,
}: {
  projectId: string;
  promptId: string;
  runId: string;
  caseResult: CaseResult;
  weights: Weights;
}) {
  const [open, setOpen] = useState(false);
  const [gradeInput, setGradeInput] = useState(caseResult.humanScore != null ? String(caseResult.humanScore) : "");
  const [gradeError, setGradeError] = useState<string | null>(null);

  if (caseResult.status === "error") {
    return (
      <div style={{ border: `0.5px solid ${COLORS.bad}66`, borderRadius: 8, padding: "9px 10px", background: COLORS.badDim }}>
        <span style={{ fontSize: 12, color: COLORS.bad, fontWeight: 600 }}>error</span>
        <span style={{ fontSize: 11.5, color: COLORS.muted, marginLeft: 8 }}>{caseResult.error ?? "Model call failed after every retry."}</span>
      </div>
    );
  }

  const blended = blendCase(caseResult.codeScore ?? 0, caseResult.modelScore ?? 0, caseResult.humanScore, weights);

  async function commitGrade() {
    const trimmed = gradeInput.trim();
    const score = trimmed === "" ? null : Math.max(0, Math.min(10, Number(trimmed)));
    if (trimmed !== "" && Number.isNaN(score)) {
      setGradeError("Enter a number 0-10.");
      return;
    }
    try {
      setGradeError(null);
      await runsApi.setHumanGrade(projectId, promptId, runId, caseResult.caseId, score);
    } catch (err) {
      setGradeError(err instanceof Error ? err.message : "Failed to save grade.");
    }
  }

  return (
    <div style={{ border: `0.5px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", background: COLORS.surface, border: "none", padding: "9px 10px",
          display: "flex", alignItems: "center", gap: 8, cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ color: COLORS.muted }}>{open ? "▾" : "▸"}</span>
        <span
          style={{
            fontSize: 12, flex: 1, color: COLORS.text, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          case {caseResult.index + 1}
        </span>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: COLORS.faint }}>
          code {caseResult.codeScore?.toFixed(0) ?? "—"}
        </span>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: COLORS.faint }}>
          model {caseResult.modelScore?.toFixed(1) ?? "—"}
        </span>
        {caseResult.humanScore != null && (
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: COLORS.accent }}>
            you {caseResult.humanScore.toFixed(1)}
          </span>
        )}
        <ScoreBadge value={blended} />
      </button>
      {open && (
        <div style={{ padding: "10px 14px 14px", background: "#0F1116", fontSize: 12 }}>
          <div style={{ color: COLORS.faint, fontSize: 10.5, marginBottom: 3 }}>output</div>
          <div style={{ color: COLORS.muted, marginBottom: 10, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{caseResult.output}</div>
          <div style={{ color: COLORS.faint, fontSize: 10.5, marginBottom: 3 }}>grader reasoning</div>
          <div style={{ color: COLORS.muted, lineHeight: 1.6, marginBottom: 10 }}>
            {caseResult.reasoning}
            {caseResult.weakness && ` (weakness: ${caseResult.weakness})`}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: COLORS.faint, fontSize: 10.5 }}>your grade</span>
            <input
              type="number"
              min={0}
              max={10}
              step={0.5}
              value={gradeInput}
              placeholder="—"
              onChange={(e) => setGradeInput(e.target.value)}
              onBlur={commitGrade}
              style={{
                background: "#0F1116", color: COLORS.text, border: `0.5px solid ${COLORS.border}`,
                borderRadius: 6, padding: "4px 6px", width: 70, fontFamily: "ui-monospace, monospace",
              }}
            />
            <span style={{ color: COLORS.faint, fontSize: 10.5 }}>
              blends at weight {weights.human} → case score {blended.toFixed(1)}
            </span>
          </div>
          {gradeError && <div style={{ fontSize: 11, color: COLORS.bad, marginTop: 6 }}>{gradeError}</div>}
        </div>
      )}
    </div>
  );
}

export function RunTab({
  projectId,
  promptId,
  draft,
  weights,
  can,
  runId,
  onRunStarted,
}: {
  projectId: string;
  promptId: string;
  draft: string;
  weights: Weights;
  can: Capabilities;
  runId: string | null;
  onRunStarted: (runId: string) => void;
}) {
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { run, cases } = useRunStream(projectId, promptId, runId);

  if (!can.edit) {
    return <div style={{ fontSize: 11.5, color: COLORS.faint }}>{requiresRoleCaption("contributor")}</div>;
  }

  async function previewRun() {
    try {
      setError(null);
      const est = await runsApi.estimate(projectId, promptId, draft);
      setEstimate(est);
      setPreviewing(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load estimate.");
    }
  }

  async function confirmRun() {
    setStarting(true);
    try {
      setError(null);
      const started = await runsApi.start(projectId, promptId, draft);
      onRunStarted(started.runId);
      setPreviewing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start the run.");
    } finally {
      setStarting(false);
    }
  }

  const running = run.data?.status === "running";
  const stats = blendRun(cases.data, weights);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {error && <div style={{ fontSize: 11.5, color: COLORS.bad }}>{error}</div>}
      {run.error && <div style={{ fontSize: 11.5, color: COLORS.bad }}>{run.error.message}</div>}
      {cases.error && <div style={{ fontSize: 11.5, color: COLORS.bad }}>{cases.error.message}</div>}

      {previewing && estimate && (
        <div style={{ border: `0.5px solid ${COLORS.accent}55`, borderRadius: 10, padding: 13, background: COLORS.accentDim }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Single run — projected cost</div>
          <EstimateTable estimate={estimate} />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Btn onClick={confirmRun} disabled={starting}>
              {starting ? "Starting…" : "Confirm & run"}
            </Btn>
            <Btn tone="ghost" onClick={() => setPreviewing(false)}>
              Cancel
            </Btn>
          </div>
        </div>
      )}

      {!previewing && !runId && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
          <div style={{ fontSize: 12.5, color: COLORS.muted }}>No run yet for this draft.</div>
          <Btn onClick={previewRun}>Run once</Btn>
        </div>
      )}

      {runId && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10.5, color: COLORS.faint, marginBottom: 3 }}>composite</div>
              {stats.composite == null ? (
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 20, color: COLORS.muted }}>…</span>
              ) : (
                <ScoreBadge value={stats.composite} size="lg" />
              )}
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: COLORS.faint, marginBottom: 3 }}>code grader</div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 15 }}>{stats.codeAvg?.toFixed(1) ?? "…"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: COLORS.faint, marginBottom: 3 }}>model grader</div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 15 }}>{stats.modelAvg?.toFixed(1) ?? "…"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: COLORS.faint, marginBottom: 3 }}>manual grades</div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 15 }}>
                {stats.humanCount}/{stats.caseCount}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: COLORS.faint, marginBottom: 3 }}>cost</div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 15 }}>
                {run.data?.costActual != null ? `$${run.data.costActual.toFixed(4)}` : "…"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: COLORS.faint, marginBottom: 3 }}>cases</div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 15 }}>
                {cases.data.length} / {stats.caseCount || cases.data.length}
              </div>
            </div>
          </div>
          {running && <div style={{ fontSize: 11, color: COLORS.faint }}>≤3 concurrent model calls · streaming as cases complete</div>}
          {stats.errorCount > 0 && (
            <div style={{ fontSize: 11, color: COLORS.bad }}>
              {stats.errorCount} case(s) failed after every retry — excluded from the composite above.
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {cases.data.map((c) => (
              <CaseDetailRow
                key={c.caseId}
                projectId={projectId}
                promptId={promptId}
                runId={runId}
                caseResult={c}
                weights={weights}
              />
            ))}
          </div>
          {!running && (
            <div>
              <Btn tone="ghost" small onClick={previewRun}>
                Run again
              </Btn>
            </div>
          )}
        </>
      )}
    </div>
  );
}
