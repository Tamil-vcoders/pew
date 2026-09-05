// web/app/(workspace)/p/[promptId]/page.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/features/auth/useAuth";
import { capabilitiesFor, type Capabilities } from "@/shared/rbac/permissions";
import { usePromptDoc, workspaceApi } from "@/features/workspace";
import { PromptEditor, VersionHistory, editorApi, useVersionsStream } from "@/features/editor";
import { SuggestionsPanel } from "@/features/suggestions";
import { COLORS } from "@/shared/ui/tokens";
import type { Prompt, Suggestion } from "@/shared/types";

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
  const currentVersion = versions.find((v) => v.n === prompt.latestVersion) ?? null;
  const currentVersionText = currentVersion?.text ?? "";

  const [draft, setDraft] = useState(currentVersionText);
  const lastSyncedVersion = useRef<number | null>(null);
  useEffect(() => {
    // Reset the draft to the new current version whenever latestVersion actually advances
    // (a version was just created, via suggestion-apply here or a future run/cycle flow) —
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
      <SuggestionsPanel projectId={projectId} promptId={prompt.id} draft={draft} can={can} onApply={applySuggestion} />
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
