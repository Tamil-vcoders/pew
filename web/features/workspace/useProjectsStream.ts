// web/features/workspace/useProjectsStream.ts
"use client";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/shared/firebase/client";
import { ProjectSchema, type Project } from "@/shared/types";
import { toError, type StreamResult } from "./streamTypes";

export function useProjectsStream(): StreamResult<Project[]> {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(collection(db, "projects"), orderBy("name"));
    return onSnapshot(
      q,
      (snap) => {
        try {
          setProjects(snap.docs.map((doc) => ProjectSchema.parse({ id: doc.id, ...doc.data() })));
          setError(null);
        } catch (err) {
          setError(toError(err, "Failed to parse a project document."));
        }
      },
      (err) => setError(toError(err, "Failed to load projects.")),
    );
  }, []);

  return { data: projects, error };
}
