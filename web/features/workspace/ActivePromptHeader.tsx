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
import { createContext, useContext, useState, type ReactNode } from "react";

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
  return (
    <ActivePromptHeaderContext.Provider value={{ header, setHeader }}>
      {children}
    </ActivePromptHeaderContext.Provider>
  );
}

export function useActivePromptHeader(): ActivePromptHeaderContextValue {
  const ctx = useContext(ActivePromptHeaderContext);
  if (!ctx) {
    throw new Error("useActivePromptHeader must be used within an ActivePromptHeaderProvider");
  }
  return ctx;
}
