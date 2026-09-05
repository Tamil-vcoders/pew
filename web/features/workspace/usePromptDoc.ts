// web/features/workspace/usePromptDoc.ts
"use client";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/shared/firebase/client";
import { PromptSchema, type Prompt } from "@/shared/types";
import { toError, type StreamResult } from "./streamTypes";

export function usePromptDoc(projectId: string, promptId: string): StreamResult<Prompt | null> {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!projectId || !promptId) {
      setPrompt(null);
      return;
    }
    const ref = doc(db, "projects", projectId, "prompts", promptId);
    return onSnapshot(
      ref,
      (snap) => {
        try {
          setPrompt(snap.exists() ? PromptSchema.parse({ id: snap.id, projectId, ...snap.data() }) : null);
          setError(null);
        } catch (err) {
          setError(toError(err, "Failed to parse the prompt document."));
        }
      },
      (err) => setError(toError(err, "Failed to load the prompt.")),
    );
  }, [projectId, promptId]);

  return { data: prompt, error };
}
