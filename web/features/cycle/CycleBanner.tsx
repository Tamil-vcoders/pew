// web/features/cycle/CycleBanner.tsx — ports the stage banners from
// docs/prototype.jsx:1444-1680 (dataset-approve / iteration-projection / grade-pause /
// flat-warning / candidate-selection). One component with an internal stage switch rather
// than one file per stage: every banner shares the same outer card chrome, and the
// stage-to-copy mapping is a single lookup, not five near-identical components.
"use client";
import { useState } from "react";
import { Btn, COLORS } from "@/shared/ui";
import { DiffBlock } from "@/features/editor";
import { EstimateTable, runsApi } from "@/features/runs";
import type { Capabilities } from "@/shared/rbac/permissions";
import type { Cycle, Estimate } from "@/shared/types";
import { cycleApi } from "./cycleApi";

const CARD_STYLE = {
  border: `0.5px solid ${COLORS.accent}55`,
  borderRadius: 10,
  padding: 13,
  background: COLORS.accentDim,
} as const;

function Card({
  title,
  body,
  can,
  children,
}: {
  title: string;
  body?: React.ReactNode;
  can: Capabilities;
  children: React.ReactNode;
}) {
  return (
    <div style={CARD_STYLE}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: body ? 5 : 10 }}>{title}</div>
      {body && <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 10, lineHeight: 1.6 }}>{body}</div>}
      {can.edit ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>
      ) : (
        <div style={{ fontSize: 11, color: COLORS.faint }}>Viewer role — read-only. A contributor or above drives this stage.</div>
      )}
    </div>
  );
}

export function CycleBanner({
  cycle,
  draft,
  can,
  onStop,
}: {
  cycle: Cycle;
  draft: string;
  can: Capabilities;
  onStop: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [selected, setSelected] = useState(cycle.pending?.selected ?? 0);

  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    try {
      setError(null);
      return await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  const errorBanner = error && <div style={{ fontSize: 11.5, color: COLORS.bad }}>{error}</div>;

  if (cycle.stage === "dataset") {
    return (
      <>
        {errorBanner}
        <Card
          title="Paused: review the dataset"
          body="Edit, add, or generate cases now — this prompt's private dataset freezes when the first run starts so scores stay comparable."
          can={can}
        >
          <Btn disabled={busy} onClick={() => run(() => cycleApi.approveDataset(cycle.id))}>
            Approve dataset &amp; continue
          </Btn>
        </Card>
      </>
    );
  }

  if (cycle.stage === "preview") {
    const remaining = cycle.configSnapshot.budget - cycle.spent;
    return (
      <>
        {errorBanner}
        <Card
          title={`Iteration ${cycle.iteration + 1} — projected cost before it starts`}
          can={can}
          body={
            <>
              {estimate ? (
                <EstimateTable estimate={estimate} />
              ) : (
                <Btn
                  tone="ghost"
                  small
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const est = await runsApi.estimate(cycle.projectId, cycle.promptId, draft);
                      setEstimate(est);
                    })
                  }
                >
                  Load projection
                </Btn>
              )}
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5, marginTop: 8, color: COLORS.muted }}>
                Remaining budget: ${remaining.toFixed(4)}
              </div>
            </>
          }
        >
          <Btn disabled={busy} onClick={() => run(() => cycleApi.confirmIteration(cycle.id, draft))}>
            Confirm &amp; run iteration
          </Btn>
          <Btn tone="danger" disabled={busy} onClick={onStop}>
            Stop
          </Btn>
        </Card>
      </>
    );
  }

  if (cycle.stage === "running") {
    return (
      <div style={{ fontSize: 12, color: COLORS.muted }}>Iteration {cycle.iteration} running…</div>
    );
  }

  if (cycle.stage === "grading") {
    return (
      <>
        {errorBanner}
        <Card
          title="Paused: review grades"
          body="Expand any case below and add your own 0–10 grade — it blends into the composite as a third grader with the weight from Setup."
          can={can}
        >
          <Btn disabled={busy} onClick={() => run(() => cycleApi.continueCycle(cycle.id))}>
            Continue to checks
          </Btn>
        </Card>
      </>
    );
  }

  if (cycle.stage === "checking" && cycle.warnedFlat) {
    return (
      <div style={{ border: `0.5px solid ${COLORS.mid}66`, borderRadius: 10, padding: 14, background: COLORS.midDim }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Cycle may not be converging</div>
        <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 10 }}>
          The score did not improve across the last two iterations. You can stop now without spending further, or continue.
        </div>
        {errorBanner}
        {can.edit && (
          <div style={{ display: "flex", gap: 8 }}>
            <Btn disabled={busy} onClick={() => run(() => cycleApi.continueCycle(cycle.id))}>
              Continue anyway
            </Btn>
            <Btn tone="ghost" disabled={busy} onClick={onStop}>
              Stop cycle
            </Btn>
          </div>
        )}
      </div>
    );
  }

  if (cycle.stage === "suggesting" && cycle.pending) {
    const candidates = cycle.pending.candidates;
    return (
      <>
        {errorBanner}
        <Card
          title={`Paused: ${candidates.length} candidate${candidates.length > 1 ? "s" : ""} — select one to continue`}
          body="One technique each. Only the selected candidate is applied and run, so cost stays flat. You can also edit the prompt in the middle panel and continue with your edits."
          can={can}
        >
          <Btn disabled={busy} onClick={() => run(() => cycleApi.selectCandidate(cycle.id, selected))}>
            Apply selected &amp; continue
          </Btn>
          <Btn tone="ghost" disabled={busy} onClick={() => run(() => cycleApi.selectCandidate(cycle.id, selected, draft))}>
            Continue with my edits
          </Btn>
          <Btn tone="danger" disabled={busy} onClick={onStop}>
            Stop
          </Btn>
        </Card>
        {candidates.map((candidate, i) => (
          <div
            key={candidate.ruleId}
            onClick={() => can.edit && setSelected(i)}
            style={{
              border: `0.5px solid ${selected === i ? COLORS.accent : COLORS.border}`,
              borderRadius: 10,
              padding: 12,
              background: selected === i ? COLORS.accentDim : COLORS.surface,
              cursor: can.edit ? "pointer" : "default",
              marginTop: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span
                style={{
                  width: 14, height: 14, borderRadius: 8,
                  border: `1.5px solid ${selected === i ? COLORS.accent : COLORS.faint}`,
                  background: selected === i ? COLORS.accent : "transparent",
                  display: "inline-block",
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{candidate.technique}</span>
              {i === 0 && (
                <span
                  style={{
                    fontFamily: "ui-monospace, monospace", fontSize: 10, color: COLORS.accent,
                    background: COLORS.accentDim, borderRadius: 4, padding: "1px 6px",
                  }}
                >
                  top-ranked
                </span>
              )}
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: COLORS.faint, marginLeft: "auto" }}>
                1 technique
              </span>
            </div>
            <DiffBlock oldText={candidate.oldText} newText={candidate.newText} />
          </div>
        ))}
      </>
    );
  }

  return null;
}
