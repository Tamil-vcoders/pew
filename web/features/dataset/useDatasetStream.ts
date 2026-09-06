// web/features/dataset/useDatasetStream.ts
"use client";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/shared/firebase/client";
import { CaseSchema, type Case } from "@/shared/types";
import { toError, type StreamResult } from "./streamTypes";

export function useDatasetStream(projectId: string, promptId: string): StreamResult<Case[]> {
  const [cases, setCases] = useState<Case[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!projectId || !promptId) {
      setCases([]);
      return;
    }
    const ref = collection(db, "projects", projectId, "prompts", promptId, "dataset");
    return onSnapshot(
      query(ref, orderBy("order")),
      (snap) => {
        try {
          setCases(snap.docs.map((d) => CaseSchema.parse({ id: d.id, ...d.data() })));
          setError(null);
        } catch (err) {
          setError(toError(err, "Failed to parse a dataset case."));
        }
      },
      (err) => setError(toError(err, "Failed to load the dataset.")),
    );
  }, [projectId, promptId]);

  return { data: cases, error };
}
