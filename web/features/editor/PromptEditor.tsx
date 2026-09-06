// web/features/editor/PromptEditor.tsx
"use client";
import { useMemo } from "react";
import { COLORS } from "@/shared/ui/tokens";
import { ValidationPanel, validateText } from "@/features/validation";

export function PromptEditor({
  draft,
  currentVersionText,
  readOnly,
  onChange,
  onRevert,
}: {
  draft: string;
  currentVersionText: string;
  readOnly: boolean;
  onChange: (text: string) => void;
  onRevert: () => void;
}) {
  const isDirty = draft !== currentVersionText;
  const results = useMemo(() => validateText(draft), [draft]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.muted }}>
            Prompt{readOnly && " (read-only)"}
          </span>
          {isDirty && !readOnly && (
            <button
              onClick={onRevert}
              style={{ background: "none", border: "none", color: COLORS.faint, fontSize: 11.5, cursor: "pointer" }}
            >
              ↺ revert
            </button>
          )}
        </div>
        <textarea
          value={draft}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          aria-label="Prompt text"
          style={{
            width: "100%", minHeight: 190, resize: "vertical",
            background: "#0F1116", color: readOnly ? COLORS.muted : COLORS.text,
            border: `0.5px solid ${isDirty ? COLORS.accent + "80" : COLORS.border}`,
            borderRadius: 8, padding: 12, fontSize: 12.5, lineHeight: 1.6,
            fontFamily: "ui-monospace, monospace",
          }}
        />
      </div>
      <ValidationPanel results={results} />
    </div>
  );
}
