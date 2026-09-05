// web/features/workspace/usePromptsStream.ts
"use client";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/shared/firebase/client";
import { PromptSchema, type Prompt } from "@/shared/types";

export function usePromptsStream(projectId: string): Prompt[] {
  const [prompts, setPrompts] = useState<Prompt[]>([]);

  useEffect(() => {
    if (!projectId) return;
    const q = query(collection(db, "projects", projectId, "prompts"), orderBy("name"));
    return onSnapshot(q, (snap) => {
      setPrompts(
        snap.docs.map((doc) =>
          PromptSchema.parse({ id: doc.id, projectId, ...doc.data() }),
        ),
      );
    });
  }, [projectId]);

  return prompts;
}
