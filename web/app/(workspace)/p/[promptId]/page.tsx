// web/app/(workspace)/p/[promptId]/page.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/features/auth/useAuth";
import { capabilitiesFor, type Capabilities } from "@/shared/rbac/permissions";
import { useProjectDoc, usePromptDoc, workspaceApi } from "@/features/workspace";
import { PromptEditor, VersionHistory, editorApi, useVersionsStream } from "@/features/editor";
import { SuggestionsPanel } from "@/features/suggestions";
import { DatasetTab, useDatasetStream } from "@/features/dataset";
import { RunTab } from "@/features/runs";
import { Tab } from "@/shared/ui";
import { COLORS } from "@/shared/ui/tokens";
import type { Prompt, Suggestion } from "@/shared/types";

type WorkTab = "dataset" | "run" | "suggestions";

function PromptHeader({ prompt, projectId, can }: { prompt: Prompt; projectId: string; can: Capabilities }) {
  // Local buffer for the in-progress name edit — binding directly to the live
  // Firestore-backed prompt.name makes every keystroke fire a PATCH. Commit on blur instead.
  const [nameDraft, setNameDraft] = useState(prompt.name);
  useEffect(() => setNameDraft(prompt.name), [prompt.name]);
  const [actionError, setActionError] = useState<string | null>(null);

  async function commitName() {
    if (nameDraft === prompt.name) return;
    try {
      setActionError(null);
      await workspaceApi.updatePrompt(projectId, prompt.id, { name: nameDraft });
    } catch (err) {
      console.error(err);
      setActionError(err instanceof Error ? err.message : "Failed to rename prompt.");
    }
  }

  async function toggleArchived() {
    try {
      setActionError(null);
      await workspaceApi.updatePrompt(projectId, prompt.id, { archived: !prompt.archived });
    } catch (err) {
      console.error(err);
      setActionError(err instanceof Error ? err.message : "Failed to update prompt.");
    }
  }

  return (
    <div>
      <input
        value={nameDraft}
        readOnly={!can.edit}
        onChange={(e) => setNameDraft(e.target.value)}
        onBlur={commitName}
        style={{ fontSize: 17, fontWeight: 600, background: "transparent", border: "none", color: COLORS.text }}
      />
      <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
        {prompt.tags.map((tag) => (
          <span key={tag} style={{ fontSize: 10, color: COLORS.muted, background: COLORS.surface2, borderRadius: 4, padding: "2px 6px" }}>
            {tag}
          </span>
        ))}
      </div>
      {actionError && <div style={{ fontSize: 11, color: COLORS.bad, marginTop: 6 }}>{actionError}</div>}
      {can.settings && (
        <button style={{ marginTop: 14 }} onClick={toggleArchived}>
          {prompt.archived ? "Unarchive" : "Archive"}
        </button>
      )}
    </div>
  );
}

function PromptWorkspace({ prompt, projectId, can }: { prompt: Prompt; projectId: string; can: Capabilities }) {
  const { data: versions, error: versionsError } = useVersionsStream(projectId, prompt.id);
  const { data: project } = useProjectDoc(projectId);
  const { data: cases, error: datasetError } = useDatasetStream(projectId, prompt.id);
  const currentVersion = versions.find((v) => v.n === prompt.latestVersion) ?? null;
  const currentVersionText = currentVersion?.text ?? "";

  const [draft, setDraft] = useState(currentVersionText);
  const [tab, setTab] = useState<WorkTab>("dataset");
  const [runId, setRunId] = useState<string | null>(null);
  const lastSyncedVersion = useRef<number | null>(null);
  useEffect(() => {
    // Reset the draft to the new current version whenever latestVersion actually advances
    // (a version was just created, via suggestion-apply here or a run against a dirty draft) —
    // but never clobber in-progress typing on an unrelated re-render.
    //
    // Only mark a version "synced" once its real doc has actually loaded (currentVersion is
    // non-null) — seeding lastSyncedVersion from prompt.latestVersion at mount would make this
    // guard already "match" before Firestore's async onSnapshot ever delivers real data,
    // permanently stranding draft at its empty initial value.
    if (currentVersion && prompt.latestVersion !== lastSyncedVersion.current) {
      setDraft(currentVersionText);
      lastSyncedVersion.current = prompt.latestVersion;
    }
  }, [prompt.latestVersion, currentVersion, currentVersionText]);

  async function applySuggestion(s: Suggestion) {
    await editorApi.createVersion(projectId, prompt.id, {
      text: s.newText, note: `Applied: ${s.technique}`, technique: s.technique,
    });
  }

  const weights = project?.cfg.weights ?? { code: 1, model: 1, human: 1 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <PromptHeader prompt={prompt} projectId={projectId} can={can} />
      <PromptEditor
        draft={draft}
        currentVersionText={currentVersionText}
        readOnly={!can.edit}
        onChange={setDraft}
        onRevert={() => setDraft(currentVersionText)}
      />
      {versionsError && <div style={{ fontSize: 11.5, color: COLORS.bad }}>{versionsError.message}</div>}
      <VersionHistory versions={versions} currentVersionN={prompt.latestVersion} />

      <div style={{ display: "flex", gap: 14, borderBottom: `0.5px solid ${COLORS.border}` }}>
        <Tab active={tab === "dataset"} onClick={() => setTab("dataset")} count={cases.length}>
          Dataset
        </Tab>
        <Tab active={tab === "run"} onClick={() => setTab("run")}>
          Run
        </Tab>
        <Tab active={tab === "suggestions"} onClick={() => setTab("suggestions")}>
          Suggestions
        </Tab>
      </div>

      {tab === "dataset" && (
        <>
          {datasetError && <div style={{ fontSize: 11.5, color: COLORS.bad }}>{datasetError.message}</div>}
          <DatasetTab projectId={projectId} promptId={prompt.id} promptName={prompt.name} draft={draft} cases={cases} can={can} />
        </>
      )}
      {tab === "run" && (
        <RunTab
          projectId={projectId}
          promptId={prompt.id}
          draft={draft}
          weights={weights}
          can={can}
          runId={runId}
          onRunStarted={setRunId}
        />
      )}
      {tab === "suggestions" && (
        <SuggestionsPanel projectId={projectId} promptId={prompt.id} draft={draft} can={can} onApply={applySuggestion} />
      )}
    </div>
  );
}

export default function PromptPage({ params }: { params: { promptId: string } }) {
  const projectId = useSearchParams().get("project") ?? "";
  const { profile } = useAuth();
  const can = capabilitiesFor(profile?.role ?? null);
  const { data: prompt, error: promptError } = usePromptDoc(projectId, params.promptId);

  if (promptError) {
    return <p style={{ color: COLORS.bad }}>{promptError.message}</p>;
  }
  if (!prompt) {
    return <p style={{ color: COLORS.muted }}>Loading…</p>;
  }
  return <PromptWorkspace key={prompt.id} prompt={prompt} projectId={projectId} can={can} />;
}
