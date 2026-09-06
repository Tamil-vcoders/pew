// web/features/cycle/useCycleElsewhereLabel.ts — resolves the prompt/project names for a
// cycle running on a DIFFERENT prompt than the one currently open, for the "cycle running
// elsewhere" note (docs/prototype.jsx:1070-1076). Shared by CycleStatusChip's callers and
// every tab that renders the note, so the usePromptDoc/useProjectDoc pair isn't duplicated.
"use client";
import { useProjectDoc, usePromptDoc } from "@/features/workspace";
import type { Cycle } from "@/shared/types";

export function useCycleElsewhereLabel(cycle: Cycle | null): string | null {
  const { data: prompt } = usePromptDoc(cycle?.projectId ?? "", cycle?.promptId ?? "");
  const { data: project } = useProjectDoc(cycle?.projectId ?? "");
  if (!cycle) return null;
  const promptName = prompt?.name ?? "…";
  const projectName = project?.name ?? "…";
  return `A cycle is running on "${promptName}" (${projectName}) — one cycle at a time.`;
}
