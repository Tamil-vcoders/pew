// web/app/(workspace)/layout.tsx
"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Archive, ArchiveRestore, GitBranch, LogOut, Menu, Play, Settings, X } from "lucide-react";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/useAuth";
import { CycleStatusChip } from "@/features/cycle";
import { ActivePromptHeaderProvider, ProjectTree, useActivePromptHeader } from "@/features/workspace";
import { Btn } from "@/shared/ui/Btn";
import { RoleBadge } from "@/shared/ui/RoleBadge";
import { COLORS } from "@/shared/ui/tokens";
import { useMediaQuery } from "@/shared/ui/useMediaQuery";

const NARROW_QUERY = "(max-width: 720px)";

function useActivePromptId(): string | null {
  const pathname = usePathname();
  const match = pathname.match(/^\/p\/([^/]+)/);
  return match ? match[1] : null;
}

function HeaderTitle() {
  const { header } = useActivePromptHeader();

  if (!header) {
    return <span style={{ fontSize: 15, fontWeight: 600 }}>Prompt Evaluation Workbench</span>;
  }

  return (
    <div>
      <div style={{ fontSize: 10.5, color: COLORS.faint, marginBottom: 2 }}>Project: {header.projectName}</div>
      <input
        value={header.promptName}
        readOnly={!header.canEdit}
        onChange={(e) => header.onRename(e.target.value)}
        spellCheck={false}
        style={{ fontSize: 15, fontWeight: 600, background: "transparent", border: "none", color: COLORS.text, padding: 0 }}
      />
      {(header.tags.length > 0 || header.canEdit) && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, flexWrap: "wrap" }}>
          {header.tags.map((tag) => (
            <span
              key={tag}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                fontSize: 10,
                color: COLORS.muted,
                background: COLORS.surface2,
                borderRadius: 4,
                padding: "2px 6px",
              }}
            >
              {tag}
              {header.canEdit && (
                <button
                  onClick={() => header.onTagsChange(header.tags.filter((t) => t !== tag))}
                  aria-label={`Remove tag ${tag}`}
                  style={{ display: "flex", background: "transparent", border: "none", color: COLORS.faint, cursor: "pointer", padding: 0 }}
                >
                  <X size={9} />
                </button>
              )}
            </span>
          ))}
          {header.canEdit && <NewTagInput tags={header.tags} onTagsChange={header.onTagsChange} />}
        </div>
      )}
    </div>
  );
}

function NewTagInput({ tags, onTagsChange }: { tags: string[]; onTagsChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function commit() {
    const tag = draft.trim();
    if (tag && !tags.includes(tag)) onTagsChange([...tags, tag]);
    setDraft("");
  }

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      onBlur={commit}
      placeholder="+ tag"
      spellCheck={false}
      style={{
        width: 48,
        fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
        fontSize: 10,
        color: COLORS.faint,
        background: "transparent",
        border: "none",
        padding: "2px 0",
      }}
    />
  );
}

function HeaderActivePromptActions() {
  const { header } = useActivePromptHeader();
  if (!header) return null;

  return (
    <>
      <div
        style={{
          fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
          fontSize: 11.5,
          color: COLORS.muted,
          display: "flex",
          alignItems: "center",
          gap: 5,
          border: `0.5px solid ${COLORS.border}`,
          borderRadius: 6,
          padding: "4px 8px",
        }}
      >
        <GitBranch size={11} />
        v{header.latestVersion}
        {header.isDirty ? " (unsaved)" : ""}
      </div>
      {header.canSettings && (
        <button
          onClick={header.onToggleArchive}
          title={header.archived ? "Unarchive prompt" : "Archive prompt"}
          style={{
            background: "transparent",
            border: `0.5px solid ${COLORS.border}`,
            borderRadius: 6,
            padding: "5px 7px",
            color: COLORS.muted,
            cursor: "pointer",
            display: "flex",
          }}
        >
          {header.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
        </button>
      )}
      {header.canEdit && (
        // aria-label distinguishes this from the Run tab's own "Run once" button (RunTab.tsx),
        // which shares the same visible text -- without it, getByRole("button", { name: "Run
        // once" }) queries (e2e/happy-path.spec.ts) can't tell the two apart.
        <Btn small onClick={header.onRunOnce} aria-label="Run once (switch to Run tab)">
          <Play size={12} /> Run once
        </Btn>
      )}
    </>
  );
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const activePromptId = useActivePromptId();
  const isNarrow = useMediaQuery(NARROW_QUERY);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const showTree = !isNarrow || drawerOpen;

  return (
    <AuthGuard>
      <ActivePromptHeaderProvider>
        <div style={{ background: COLORS.bg, color: COLORS.text, height: "100vh", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)" }}>
          <div
            style={{
              padding: "12px 20px",
              borderBottom: `0.5px solid ${COLORS.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 220 }}>
              {isNarrow && (
                <Btn tone="ghost" small onClick={() => setDrawerOpen((o) => !o)}>
                  <Menu size={13} /> Projects
                </Btn>
              )}
              <HeaderTitle />
            </div>
            {profile && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <CycleStatusChip />
                <HeaderActivePromptActions />
                <div style={{ display: "flex", alignItems: "center", gap: 8, borderLeft: `0.5px solid ${COLORS.border}`, paddingLeft: 10 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11.5, fontWeight: 500 }}>{profile.name}</div>
                    <RoleBadge role={profile.role} />
                  </div>
                  <Link href="/settings" title="Global settings">
                    <button
                      title="Global settings"
                      style={{
                        background: "transparent",
                        border: `0.5px solid ${COLORS.border}`,
                        borderRadius: 6,
                        padding: "5px 7px",
                        color: COLORS.muted,
                        cursor: "pointer",
                        display: "flex",
                      }}
                    >
                      <Settings size={13} />
                    </button>
                  </Link>
                  <button
                    onClick={() => signOut()}
                    title="Sign out"
                    style={{
                      background: "transparent",
                      border: `0.5px solid ${COLORS.border}`,
                      borderRadius: 6,
                      padding: "5px 7px",
                      color: COLORS.muted,
                      cursor: "pointer",
                      display: "flex",
                    }}
                  >
                    <LogOut size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrow ? "1fr" : "230px 1fr",
              gridTemplateRows: isNarrow && showTree ? "auto minmax(0, 1fr)" : "minmax(0, 1fr)",
              // The shell is a fixed 100vh frame (docs/prototype.jsx:1172): the header stays
              // put, the tree keeps its "show archived" footer pinned to the bottom, and the
              // page content scrolls inside its own column. Both this grid and the outer one
              // use minmax(0, 1fr) rows so the heights are definite in every engine (WebKit
              // does not reliably shrink a flex child below its content height).
              minHeight: 0,
              height: "100%",
            }}
          >
            {showTree && (
              <div
                style={{
                  borderRight: isNarrow ? "none" : `0.5px solid ${COLORS.border}`,
                  borderBottom: isNarrow ? `0.5px solid ${COLORS.border}` : "none",
                  maxHeight: isNarrow ? "40vh" : undefined,
                  minHeight: 0,
                  height: isNarrow ? undefined : "100%",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <ProjectTree role={profile?.role ?? null} activePromptId={activePromptId} />
              </div>
            )}
            <div style={{ minHeight: 0, height: "100%", overflowY: "auto", overflowX: "hidden" }}>{children}</div>
          </div>
        </div>
      </ActivePromptHeaderProvider>
    </AuthGuard>
  );
}
