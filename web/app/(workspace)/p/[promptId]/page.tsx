// web/app/(workspace)/p/[promptId]/page.tsx
"use client";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/features/auth/useAuth";
import { capabilitiesFor } from "@/shared/rbac/permissions";
import { usePromptDoc, workspaceApi } from "@/features/workspace";
import { COLORS } from "@/shared/ui/tokens";

export default function PromptPage({ params }: { params: { promptId: string } }) {
  const projectId = useSearchParams().get("project") ?? "";
  const { profile } = useAuth();
  const can = capabilitiesFor(profile?.role ?? null);
  const prompt = usePromptDoc(projectId, params.promptId);

  if (!prompt) {
    return <p style={{ color: COLORS.muted }}>Loading…</p>;
  }

  return (
    <div>
      <input
        value={prompt.name}
        readOnly={!can.edit}
        onChange={(e) => workspaceApi.updatePrompt(projectId, prompt.id, { name: e.target.value })}
        style={{ fontSize: 17, fontWeight: 600, background: "transparent", border: "none", color: COLORS.text }}
      />
      <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
        {prompt.tags.map((tag) => (
          <span key={tag} style={{ fontSize: 10, color: COLORS.muted, background: COLORS.surface2, borderRadius: 4, padding: "2px 6px" }}>
            {tag}
          </span>
        ))}
      </div>
      {can.settings && (
        <button
          style={{ marginTop: 14 }}
          onClick={() => workspaceApi.updatePrompt(projectId, prompt.id, { archived: !prompt.archived })}
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
