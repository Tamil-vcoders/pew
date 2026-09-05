// web/features/suggestions/SuggestionsPanel.tsx
"use client";
import { useEffect, useState } from "react";
import { COLORS } from "@/shared/ui";
import { requiresRoleCaption, type Capabilities } from "@/shared/rbac/permissions";
import type { Suggestion } from "@/shared/types";
import { suggestionsApi } from "./suggestionsApi";
import { SuggestionCard } from "./SuggestionCard";

export function SuggestionsPanel({
  projectId,
  promptId,
  draft,
  can,
  onApply,
}: {
  projectId: string;
  promptId: string;
  draft: string;
  can: Capabilities;
  onApply: (suggestion: Suggestion) => void | Promise<void>;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!can.edit) return;
    const timer = setTimeout(() => {
      suggestionsApi
        .generate(projectId, promptId, draft)
        .then((result) => {
          setSuggestions(result);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to generate suggestions."));
    }, 400);
    return () => clearTimeout(timer);
  }, [projectId, promptId, draft, can.edit]);

  if (!can.edit) {
    return <div style={{ fontSize: 11.5, color: COLORS.faint }}>{requiresRoleCaption("contributor")}</div>;
  }

  const visible = suggestions.filter((s) => !dismissed.has(s.ruleId));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.muted }}>Suggestions</span>
      {error && <div style={{ fontSize: 11.5, color: COLORS.bad }}>{error}</div>}
      {visible.length === 0 && !error && (
        <div style={{ fontSize: 12.5, color: COLORS.muted, padding: "20px 4px", textAlign: "center" }}>
          No open suggestions — every catalogue rule passes on this draft.
        </div>
      )}
      {visible.map((s) => (
        <SuggestionCard
          key={s.ruleId}
          suggestion={s}
          canApply={can.edit}
          onApply={() => onApply(s)}
          onDismiss={() => setDismissed((prev) => new Set(prev).add(s.ruleId))}
        />
      ))}
    </div>
  );
}
