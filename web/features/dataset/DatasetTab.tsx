// web/features/dataset/DatasetTab.tsx
"use client";
import { useState, type CSSProperties } from "react";
import { Btn, COLORS } from "@/shared/ui";
import { requiresRoleCaption, type Capabilities } from "@/shared/rbac/permissions";
import type { Case } from "@/shared/types";
import { datasetApi } from "./datasetApi";

const inputStyle: CSSProperties = {
  background: "#0F1116", color: COLORS.text, border: `0.5px solid ${COLORS.border}`,
  borderRadius: 6, padding: "6px 8px", fontSize: 12.5, outline: "none", width: "100%",
};

function CaseRow({
  projectId, promptId, case: c, index, canEdit,
}: {
  projectId: string; promptId: string; case: Case; index: number; canEdit: boolean;
}) {
  const [input, setInput] = useState(c.input);
  const [expected, setExpected] = useState(c.expected);
  const [error, setError] = useState<string | null>(null);

  async function commit(patch: Partial<Pick<Case, "input" | "expected">>) {
    try {
      setError(null);
      await datasetApi.update(projectId, promptId, c.id, patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update case.");
    }
  }

  async function remove() {
    try {
      setError(null);
      await datasetApi.remove(projectId, promptId, c.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete case.");
    }
  }

  return (
    <div style={{ border: `0.5px solid ${COLORS.border}`, borderRadius: 8, padding: 10, background: COLORS.surface }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: COLORS.faint, marginTop: 8 }}>
          {index + 1}
        </span>
        {canEdit ? (
          <textarea
            value={input}
            rows={2}
            spellCheck={false}
            placeholder="Input text…"
            onChange={(e) => setInput(e.target.value)}
            onBlur={() => input !== c.input && commit({ input })}
            style={{ ...inputStyle, flex: 1, resize: "vertical", lineHeight: 1.5 }}
          />
        ) : (
          <div style={{ fontSize: 12.5, lineHeight: 1.55, flex: 1, padding: "6px 0" }}>{c.input}</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          {canEdit ? (
            <input
              value={expected}
              placeholder="expected…"
              onChange={(e) => setExpected(e.target.value)}
              onBlur={() => expected !== c.expected && commit({ expected })}
              style={{ ...inputStyle, width: 120, padding: "4px 6px", fontSize: 11, fontFamily: "ui-monospace, monospace" }}
            />
          ) : (
            <span
              style={{
                fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: COLORS.muted,
                background: COLORS.surface2, borderRadius: 4, padding: "2px 6px",
              }}
            >
              expected: {c.expected}
            </span>
          )}
          <span style={{ fontSize: 9.5, color: COLORS.faint }}>{c.source}</span>
          {canEdit && (
            <button
              onClick={remove}
              title="Delete case"
              style={{ background: "none", border: "none", color: COLORS.faint, cursor: "pointer", padding: 2 }}
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {error && <div style={{ fontSize: 11, color: COLORS.bad, marginTop: 6 }}>{error}</div>}
    </div>
  );
}

function AddCaseForm({ projectId, promptId }: { projectId: string; promptId: string }) {
  const [input, setInput] = useState("");
  const [expected, setExpected] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!input.trim() || !expected.trim()) return;
    try {
      setError(null);
      await datasetApi.create(projectId, promptId, input.trim(), expected.trim());
      setInput("");
      setExpected("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add case.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={input}
          placeholder="New case input…"
          onChange={(e) => setInput(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
        <input
          value={expected}
          placeholder="expected…"
          onChange={(e) => setExpected(e.target.value)}
          style={{ ...inputStyle, width: 120 }}
        />
        <Btn tone="ghost" small onClick={submit}>
          Add case
        </Btn>
      </div>
      {error && <div style={{ fontSize: 11, color: COLORS.bad }}>{error}</div>}
    </div>
  );
}

export function DatasetTab({
  projectId,
  promptId,
  promptName,
  draft,
  cases,
  can,
  locked = false,
}: {
  projectId: string;
  promptId: string;
  promptName: string;
  draft: string;
  cases: Case[];
  can: Capabilities;
  /** True once the owning cycle's iteration >= 1 (devspec: the dataset freezes once the
   * first run starts so scores stay comparable). Matches the API's 409 condition exactly,
   * so this never shows an editable form the server would reject. */
  locked?: boolean;
}) {
  const [genLog, setGenLog] = useState<string[]>([]);
  const [genError, setGenError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);
    setGenError(null);
    try {
      const result = await datasetApi.generate(projectId, promptId, draft, 3);
      setGenLog((log) => [
        ...log,
        `Generated ${result.cases.length} case(s) with ${result.model} · $${result.cost.toFixed(4)}`,
      ]);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Failed to generate cases.");
    } finally {
      setGenerating(false);
    }
  }

  if (!can.edit || locked) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11.5, color: COLORS.faint }}>
          {locked
            ? "Locked while the cycle runs — editable again once the cycle ends."
            : requiresRoleCaption("contributor")}
        </div>
        {cases.map((c, i) => (
          <CaseRow key={c.id} projectId={projectId} promptId={promptId} case={c} index={i} canEdit={false} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontSize: 11.5, color: COLORS.faint }}>Private to &quot;{promptName}&quot;</div>
        <Btn tone="ghost" small disabled={generating} onClick={generate}>
          {generating ? "Generating…" : "Generate 3 with AI"}
        </Btn>
      </div>
      <AddCaseForm projectId={projectId} promptId={promptId} />
      {cases.map((c, i) => (
        <CaseRow key={c.id} projectId={projectId} promptId={promptId} case={c} index={i} canEdit={can.edit} />
      ))}
      {genError && <div style={{ fontSize: 11.5, color: COLORS.bad }}>{genError}</div>}
      {genLog.length > 0 && (
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: COLORS.faint, lineHeight: 1.7 }}>
          {genLog.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
