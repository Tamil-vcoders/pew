// web/features/editor/useVersionsStream.ts
"use client";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/shared/firebase/client";
import { VersionSchema, type Version } from "@/shared/types";
import { toError, type StreamResult } from "./streamTypes";

export function useVersionsStream(projectId: string, promptId: string): StreamResult<Version[]> {
  const [versions, setVersions] = useState<Version[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!projectId || !promptId) {
      setVersions([]);
      return;
    }
    const ref = collection(db, "projects", projectId, "prompts", promptId, "versions");
    return onSnapshot(
      query(ref, orderBy("n", "desc")),
      (snap) => {
        try {
          setVersions(
            snap.docs.map((d) => {
              const raw = d.data() as Record<string, unknown>;
              // Firestore returns createdAt as a client Timestamp (with .toDate()), not the
              // ISO string the POST .../versions response uses — normalize both onto the
              // same shape before validating so the two sources agree.
              const createdAt = raw.createdAt as { toDate?: () => Date } | null;
              return VersionSchema.parse({
                ...raw,
                createdAt: createdAt?.toDate ? createdAt.toDate().toISOString() : null,
              });
            }),
          );
          setError(null);
        } catch (err) {
          setError(toError(err, "Failed to parse version history."));
        }
      },
      (err) => setError(toError(err, "Failed to load version history.")),
    );
  }, [projectId, promptId]);

  return { data: versions, error };
}
