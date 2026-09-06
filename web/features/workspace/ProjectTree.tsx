// web/features/workspace/ProjectTree.tsx
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { capabilitiesFor, type Role } from "@/shared/rbac/permissions";
import { COLORS } from "@/shared/ui/tokens";
import { useProjectsStream } from "./useProjectsStream";
import { usePromptsStream } from "./usePromptsStream";
import { workspaceApi } from "./workspaceApi";
import type { Project } from "@/shared/types";

function ProjectRow({
  project,
  activePromptId,
  can,
  search,
  showArchived,
}: {
  project: Project;
  activePromptId: string | null;
  can: ReturnType<typeof capabilitiesFor>;
  search: string;
  showArchived: boolean;
}) {
  const router = useRouter();
  const { data: prompts, error: promptsError } = usePromptsStream(project.id);
  const q = search.trim().toLowerCase();
  const visible = prompts
    .filter((p) => showArchived || !p.archived)
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)));

  // Local buffer for the in-progress edit: binding the input directly to the live
  // Firestore-backed `project.name` means every keystroke re-renders with the OLD
  // value until the rename PATCH round-trips through the API and Firestore, so the
  // displayed text visibly lags/fights what was typed. Buffer locally and only commit
  // on blur; re-sync if the name changes from elsewhere (e.g. another user renames it).
  const [nameDraft, setNameDraft] = useState(project.name);
  useEffect(() => {
    setNameDraft(project.name);
  }, [project.name]);
  const [actionError, setActionError] = useState<string | null>(null);

  if (q && visible.length === 0) return null;
  const noPromptsAtAll = prompts.length === 0 && !q;

  async function commitRename() {
    if (nameDraft === project.name) return;
    try {
      setActionError(null);
      await workspaceApi.renameProject(project.id, nameDraft);
    } catch (err) {
      console.error(err);
      setActionError(err instanceof Error ? err.message : "Failed to rename project.");
    }
  }

  async function createPrompt() {
    try {
      setActionError(null);
      const created = await workspaceApi.createPrompt(project.id, `New prompt ${prompts.length + 1}`, []);
      router.push(`/p/${created.id}?project=${project.id}`);
    } catch (err) {
      console.error(err);
      setActionError(err instanceof Error ? err.message : "Failed to create prompt.");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 4px" }}>
        {can.settings ? (
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            spellCheck={false}
            aria-label="Project name"
            style={{ flex: 1, fontSize: 11, fontWeight: 600, color: COLORS.muted, textTransform: "uppercase" }}
          />
        ) : (
          <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: COLORS.muted, textTransform: "uppercase" }}>
            {project.name}
          </span>
        )}
        {can.edit && (
          <button title="New prompt in this project" aria-label="New prompt in this project" onClick={createPrompt}>
            +
          </button>
        )}
      </div>
      {actionError && (
        <div style={{ fontSize: 10, color: COLORS.bad, padding: "0 4px 4px" }}>{actionError}</div>
      )}
      {promptsError && (
        <div style={{ fontSize: 10, color: COLORS.bad, padding: "0 4px 4px" }}>{promptsError.message}</div>
      )}
      {noPromptsAtAll && (
        <div style={{ fontSize: 10.5, color: COLORS.faint, padding: "0 4px 6px 20px" }}>No prompts in this project yet.</div>
      )}
      {visible.map((prompt) => (
        <Link
          key={prompt.id}
          href={`/p/${prompt.id}?project=${project.id}`}
          style={{
            display: "block",
            padding: "7px 8px 7px 20px",
            background: prompt.id === activePromptId ? COLORS.accentDim : "transparent",
            color: prompt.archived ? COLORS.faint : COLORS.text,
            textDecoration: prompt.archived ? "line-through" : "none",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 500 }}>{prompt.name}</span>
          <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
            {prompt.tags.slice(0, 3).map((tag) => (
              <span key={tag} style={{ fontSize: 9.5, color: COLORS.muted, background: COLORS.surface2, borderRadius: 3, padding: "0 4px" }}>
                {tag}
              </span>
            ))}
          </div>
        </Link>
      ))}
    </div>
  );
}

export function ProjectTree({ role, activePromptId }: { role: Role | null; activePromptId: string | null }) {
  const can = capabilitiesFor(role);
  const { data: projects, error: projectsError } = useProjectsStream();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function createProject() {
    try {
      setCreateError(null);
      await workspaceApi.createProject(`New project ${projects.length + 1}`);
    } catch (err) {
      console.error(err);
      setCreateError(err instanceof Error ? err.message : "Failed to create project.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, width: "100%" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          placeholder="name or tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search prompts by name or tag"
          style={{ flex: 1 }}
        />
        {can.settings && (
          <button title="New project" aria-label="New project" onClick={createProject}>
            +
          </button>
        )}
      </div>
      {createError && <div style={{ fontSize: 10.5, color: COLORS.bad }}>{createError}</div>}
      {projectsError && <div style={{ fontSize: 10.5, color: COLORS.bad }}>{projectsError.message}</div>}
      {projects.length === 0 && !projectsError && (
        <div style={{ fontSize: 10.5, color: COLORS.faint }}>No projects yet.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, overflow: "auto" }}>
        {projects.map((project) => (
          <ProjectRow
            key={project.id}
            project={project}
            activePromptId={activePromptId}
            can={can}
            search={search}
            showArchived={showArchived}
          />
        ))}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: COLORS.faint }}>
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
          aria-label="show archived"
        />
        show archived
      </label>
    </div>
  );
}
