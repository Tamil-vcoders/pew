// web/features/workspace/usePromptDoc.ts
"use client";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/shared/firebase/client";
import { PromptSchema, type Prompt } from "@/shared/types";

export function usePromptDoc(projectId: string, promptId: string): Prompt | null {
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  useEffect(() => {
    if (!projectId || !promptId) {
      setPrompt(null);
      return;
    }
    const ref = doc(db, "projects", projectId, "prompts", promptId);
    return onSnapshot(ref, (snap) => {
      setPrompt(snap.exists() ? PromptSchema.parse({ id: snap.id, projectId, ...snap.data() }) : null);
    });
  }, [projectId, promptId]);

  return prompt;
}
