// web/features/workspace/ActivePromptHeader.tsx
//
// The persistent top header bar (rendered by app/(workspace)/layout.tsx) shows the active
// prompt's project name, editable prompt name, tags, version chip, archive button, and a
// "Run once" shortcut -- matching docs/prototype.jsx's single unified header row (lines
// 1085-1162). But the layout and the page that knows which prompt is active
// (app/(workspace)/p/[promptId]/page.tsx) are different levels of the Next.js App Router
// tree; a layout cannot read a child page's route params or local state directly. This
// context is how the page publishes its prompt's header data upward for the layout to render.
"use client";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export interface ActivePromptHeaderData {
  projectName: string;
  promptName: string;
  tags: string[];
  latestVersion: number;
  isDirty: boolean;
  archived: boolean;
  canEdit: boolean;
  canSettings: boolean;
  onRename: (name: string) => void;
  onTagsChange: (tags: string[]) => void;
  onToggleArchive: () => void;
  onRunOnce: () => void;
}

interface ActivePromptHeaderContextValue {
  header: ActivePromptHeaderData | null;
  setHeader: (header: ActivePromptHeaderData | null) => void;
}

const ActivePromptHeaderContext = createContext<ActivePromptHeaderContextValue | null>(null);

export function ActivePromptHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<ActivePromptHeaderData | null>(null);
  // Memoized so a re-render of the provider that leaves `header` unchanged doesn't hand
  // every context consumer a new object identity -- important because a consumer that also
  // publishes into this context (the prompt page, via useActivePromptHeaderSync) would
  // otherwise re-render itself, recreate its effect's dependency closures, and re-fire the
  // publishing effect indefinitely.
  const value = useMemo(() => ({ header, setHeader }), [header]);
  return <ActivePromptHeaderContext.Provider value={value}>{children}</ActivePromptHeaderContext.Provider>;
}

export function useActivePromptHeader(): ActivePromptHeaderContextValue {
  const ctx = useContext(ActivePromptHeaderContext);
  if (!ctx) {
    throw new Error("useActivePromptHeader must be used within an ActivePromptHeaderProvider");
  }
  return ctx;
}
