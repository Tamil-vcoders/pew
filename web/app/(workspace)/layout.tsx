// web/app/(workspace)/layout.tsx
"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/useAuth";
import { ProjectTree } from "@/features/workspace";
import { Btn } from "@/shared/ui/Btn";
import { RoleBadge } from "@/shared/ui/RoleBadge";
import { COLORS } from "@/shared/ui/tokens";

function useActivePromptId(): string | null {
  const pathname = usePathname();
  const match = pathname.match(/^\/p\/([^/]+)/);
  return match ? match[1] : null;
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const activePromptId = useActivePromptId();

  return (
    <AuthGuard>
      <div style={{ background: COLORS.bg, color: COLORS.text, minHeight: "100vh" }}>
        <div
          style={{
            padding: "12px 20px",
            borderBottom: `0.5px solid ${COLORS.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600 }}>Prompt Evaluation Workbench</span>
          {profile && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11.5, fontWeight: 500 }}>{profile.name}</div>
                <RoleBadge role={profile.role} />
              </div>
              <Link href="/settings" title="Global settings">
                <Btn tone="ghost" small>
                  Settings
                </Btn>
              </Link>
              <Btn tone="ghost" small onClick={() => signOut()}>
                Sign out
              </Btn>
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "230px 1fr", minHeight: "calc(100vh - 53px)" }}>
          <div style={{ borderRight: `0.5px solid ${COLORS.border}` }}>
            <ProjectTree role={profile?.role ?? null} activePromptId={activePromptId} />
          </div>
          <div style={{ padding: 18 }}>{children}</div>
        </div>
      </div>
    </AuthGuard>
  );
}
