// web/features/workspace/ProjectTree.tsx
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  const prompts = usePromptsStream(project.id);
  const q = search.trim().toLowerCase();
  const visible = prompts
    .filter((p) => showArchived || !p.archived)
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.tags.some((t) => t.includes(q)));

  if (q && visible.length === 0) return null;

  async function createPrompt() {
    const created = await workspaceApi.createPrompt(project.id, `New prompt ${prompts.length + 1}`, []);
    router.push(`/p/${created.id}?project=${project.id}`);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 4px" }}>
        <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: COLORS.muted, textTransform: "uppercase" }}>
          {project.name}
        </span>
        {can.edit && (
          <button title="New prompt in this project" onClick={createPrompt}>
            +
          </button>
        )}
      </div>
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
  const projects = useProjectsStream();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, width: 230 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          placeholder="name or tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        {can.settings && (
          <button title="New project" onClick={() => workspaceApi.createProject(`New project ${projects.length + 1}`)}>
            +
          </button>
        )}
      </div>
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
