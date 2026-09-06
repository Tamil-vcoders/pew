// web/features/runs/useRunStream.ts — devspec §5's reference streaming hook, adapted to
// this repo's zod-parse-in-hook convention (see features/editor/useVersionsStream.ts).
"use client";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/shared/firebase/client";
import { CaseResultSchema, RunSchema, type CaseResult, type Run } from "@/shared/types";
import { toError, type StreamResult } from "./streamTypes";

export function useRunStream(
  projectId: string,
  promptId: string,
  runId: string | null,
): { run: StreamResult<Run | null>; cases: StreamResult<CaseResult[]> } {
  const [run, setRun] = useState<Run | null>(null);
  const [runError, setRunError] = useState<Error | null>(null);
  const [cases, setCases] = useState<CaseResult[]>([]);
  const [casesError, setCasesError] = useState<Error | null>(null);

  useEffect(() => {
    if (!projectId || !promptId || !runId) {
      setRun(null);
      setCases([]);
      return;
    }
    const base = `projects/${projectId}/prompts/${promptId}/runs/${runId}`;

    const unsubRun = onSnapshot(
      doc(db, base),
      (snap) => {
        try {
          if (!snap.exists()) {
            setRun(null);
            return;
          }
          const raw = snap.data() as Record<string, unknown>;
          const startedAt = raw.startedAt as { toDate?: () => Date } | null;
          setRun(
            RunSchema.parse({
              ...raw,
              startedAt: startedAt?.toDate ? startedAt.toDate().toISOString() : null,
            }),
          );
          setRunError(null);
        } catch (err) {
          setRunError(toError(err, "Failed to parse the run document."));
        }
      },
      (err) => setRunError(toError(err, "Failed to load the run.")),
    );

    const unsubCases = onSnapshot(
      query(collection(db, `${base}/cases`), orderBy("index")),
      (snap) => {
        try {
          setCases(snap.docs.map((d) => CaseResultSchema.parse(d.data())));
          setCasesError(null);
        } catch (err) {
          setCasesError(toError(err, "Failed to parse a case result."));
        }
      },
      (err) => setCasesError(toError(err, "Failed to load case results.")),
    );

    return () => {
      unsubRun();
      unsubCases();
    };
  }, [projectId, promptId, runId]);

  return { run: { data: run, error: runError }, cases: { data: cases, error: casesError } };
}
