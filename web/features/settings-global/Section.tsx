// web/features/settings-global/Section.tsx — ports the `Section` card shell from
// docs/prototype.jsx:405-415 (border/radius/padding/title/note). The prototype decorates each
// title with a lucide icon; no icon library exists anywhere else in this codebase, and adding
// one for purely decorative per-section icons would be inconsistent with every other screen's
// plain-text aesthetic, so those are dropped here (title/note copy is what carries meaning).
import type { ReactNode } from "react";
import { COLORS } from "@/shared/ui";

export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ border: `0.5px solid ${COLORS.border}`, borderRadius: 10, padding: 14, background: COLORS.surface }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{title}</div>
      {children}
      {note && <div style={{ fontSize: 10.5, color: COLORS.faint, marginTop: 8, lineHeight: 1.6 }}>{note}</div>}
    </div>
  );
}
