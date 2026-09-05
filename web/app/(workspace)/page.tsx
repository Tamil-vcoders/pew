// web/app/(workspace)/page.tsx
import { COLORS } from "@/shared/ui/tokens";

export default function WorkspaceHome() {
  return (
    <div style={{ color: COLORS.muted, fontSize: 13 }}>
      Select a prompt from the tree on the left, or create one to get started.
    </div>
  );
}
