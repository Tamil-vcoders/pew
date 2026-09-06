// web/features/cycle/useCycle.ts — subscribes to the single most recent cycle, globally
// (devspec's v1 one-active-cycle-at-a-time simplification means there's only ever one
// interesting cycle at a time). No promptId param: this hook is safe to call independently
// from multiple components (the header status chip and the prompt page both need it), the
// same way useProjectDoc/usePromptDoc are each called independently rather than threaded
// through context.
//
// Deliberately NOT filtered by status=="active": a cycle must stay reachable for a while
// after it ends too, so the ended-cycle card and "new cycle from best" (AC-9.4) have
// something to render on the prompt it just finished on. Callers that need "is a cycle
// blocking things right now" check `cycle.status === "active"` themselves (CycleStatusChip,
// the dataset-freeze/manual-run-block gating in the prompt page, etc.) — this hook only
// answers "what's the most recent cycle", not "is one currently active".
"use client";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/shared/firebase/client";
import { CycleSchema, type Cycle } from "@/shared/types";
import { toError, type StreamResult } from "./streamTypes";

export function useCycle(): StreamResult<Cycle | null> {
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const mostRecentCycleQuery = query(collection(db, "cycles"), orderBy("startedAt", "desc"), limit(1));
    return onSnapshot(
      mostRecentCycleQuery,
      (snap) => {
        try {
          if (snap.empty) {
            setCycle(null);
            return;
          }
          const d = snap.docs[0];
          const raw = d.data() as Record<string, unknown>;
          const log = Array.isArray(raw.log)
            ? raw.log.map((entry: Record<string, unknown>) => {
                const ts = entry.ts as { toDate?: () => Date } | string | null | undefined;
                return {
                  ...entry,
                  ts: ts && typeof ts === "object" && ts.toDate ? ts.toDate().toISOString() : ts,
                };
              })
            : raw.log;
          setCycle(CycleSchema.parse({ id: d.id, ...raw, log }));
          setError(null);
        } catch (err) {
          setError(toError(err, "Failed to parse the active cycle."));
        }
      },
      (err) => setError(toError(err, "Failed to load the active cycle.")),
    );
  }, []);

  return { data: cycle, error };
}
