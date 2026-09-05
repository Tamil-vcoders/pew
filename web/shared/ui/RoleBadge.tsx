// web/shared/ui/RoleBadge.tsx
import type { Role } from "@/shared/rbac/permissions";
import { COLORS, ROLE_COLOR } from "./tokens";

export function RoleBadge({ role }: { role: Role }) {
  const color = ROLE_COLOR[role] ?? COLORS.faint;
  return (
    <span
      style={{
        fontSize: 10,
        fontFamily: "ui-monospace, monospace",
        color,
        background: `${color}1F`,
        border: `0.5px solid ${color}55`,
        borderRadius: 4,
        padding: "1px 6px",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {role}
    </span>
  );
}
