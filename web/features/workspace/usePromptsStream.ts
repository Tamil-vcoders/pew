// web/features/workspace/usePromptsStream.ts
"use client";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/shared/firebase/client";
import { PromptSchema, type Prompt } from "@/shared/types";
import { toError, type StreamResult } from "./streamTypes";

export function usePromptsStream(projectId: string): StreamResult<Prompt[]> {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const q = query(collection(db, "projects", projectId, "prompts"), orderBy("name"));
    return onSnapshot(
      q,
      (snap) => {
        try {
          setPrompts(
            snap.docs.map((doc) => PromptSchema.parse({ id: doc.id, projectId, ...doc.data() })),
          );
          setError(null);
        } catch (err) {
          setError(toError(err, "Failed to parse a prompt document."));
        }
      },
      (err) => setError(toError(err, "Failed to load prompts.")),
    );
  }, [projectId]);

  return { data: prompts, error };
}
