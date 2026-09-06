// web/features/workspace/useProjectDoc.ts
"use client";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/shared/firebase/client";
import { ProjectSchema, type Project } from "@/shared/types";
import { toError, type StreamResult } from "./streamTypes";

export function useProjectDoc(projectId: string): StreamResult<Project | null> {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      return;
    }
    const ref = doc(db, "projects", projectId);
    return onSnapshot(
      ref,
      (snap) => {
        try {
          setProject(snap.exists() ? ProjectSchema.parse({ id: snap.id, ...snap.data() }) : null);
          setError(null);
        } catch (err) {
          setError(toError(err, "Failed to parse the project document."));
        }
      },
      (err) => setError(toError(err, "Failed to load the project.")),
    );
  }, [projectId]);

  return { data: project, error };
}
