// web/app/(workspace)/p/[promptId]/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/features/auth/useAuth";
import { capabilitiesFor } from "@/shared/rbac/permissions";
import { usePromptDoc, workspaceApi } from "@/features/workspace";
import { COLORS } from "@/shared/ui/tokens";

export default function PromptPage({ params }: { params: { promptId: string } }) {
  const projectId = useSearchParams().get("project") ?? "";
  const { profile } = useAuth();
  const can = capabilitiesFor(profile?.role ?? null);
  const { data: prompt, error: promptError } = usePromptDoc(projectId, params.promptId);

  // Local buffer for the in-progress name edit, same reasoning as ProjectTree's project
  // name input: binding directly to the live Firestore-backed prompt.name makes every
  // keystroke fire a PATCH and re-render with the stale value until it round-trips. Commit
  // on blur instead, and re-sync if the name changes from elsewhere.
  const [nameDraft, setNameDraft] = useState("");
  useEffect(() => {
    setNameDraft(prompt?.name ?? "");
  }, [prompt?.name]);
  const [actionError, setActionError] = useState<string | null>(null);

  if (promptError) {
    return <p style={{ color: COLORS.bad }}>{promptError.message}</p>;
  }

  if (!prompt) {
    return <p style={{ color: COLORS.muted }}>Loading…</p>;
  }

  async function commitName() {
    if (!prompt || nameDraft === prompt.name) return;
    try {
      setActionError(null);
      await workspaceApi.updatePrompt(projectId, prompt.id, { name: nameDraft });
    } catch (err) {
      console.error(err);
      setActionError(err instanceof Error ? err.message : "Failed to rename prompt.");
    }
  }

  async function toggleArchived() {
    if (!prompt) return;
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
        <button
          style={{ marginTop: 14 }}
          onClick={toggleArchived}
        >
          {prompt.archived ? "Unarchive" : "Archive"}
        </button>
      )}
      <p style={{ marginTop: 20, color: COLORS.faint, fontSize: 12 }}>
        Editor, static validation, and version history land in Phase 2.
      </p>
    </div>
  );
}
