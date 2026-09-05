// web/features/suggestions/SuggestionCard.tsx
"use client";
import { Btn, COLORS } from "@/shared/ui";
import { DiffBlock } from "@/features/editor";
import type { Suggestion } from "@/shared/types";

export function SuggestionCard({
  suggestion,
  canApply,
  onApply,
  onDismiss,
}: {
  suggestion: Suggestion;
  canApply: boolean;
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <div style={{ border: `0.5px solid ${COLORS.border}`, borderRadius: 10, padding: 12, background: COLORS.surface }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{suggestion.technique}</span>
        <span
          style={{
            fontFamily: "ui-monospace, monospace", fontSize: 10, color: COLORS.accent,
            background: COLORS.accentDim, borderRadius: 4, padding: "1px 6px", marginLeft: "auto",
          }}
        >
          1 technique
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: COLORS.muted, marginBottom: 10 }}>Evidence: {suggestion.evidence}</div>
      <DiffBlock oldText={suggestion.oldText} newText={suggestion.newText} />
      {canApply && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <Btn onClick={onApply}>Apply as new version</Btn>
          <Btn tone="ghost" onClick={onDismiss}>Dismiss</Btn>
        </div>
      )}
    </div>
  );
}
