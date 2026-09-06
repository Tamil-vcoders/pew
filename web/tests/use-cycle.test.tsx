// web/tests/use-cycle.test.tsx
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";

type SnapshotCallback = (snap: unknown) => void;
type ErrorCallback = (err: Error) => void;

let capturedCallback: SnapshotCallback | null = null;
let capturedErrorCallback: ErrorCallback | null = null;
const unsubscribe = vi.fn();

vi.mock("../shared/firebase/client", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({ __path: "cycles" })),
  query: vi.fn((ref: unknown) => ref),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn((_ref: unknown, cb: SnapshotCallback, errCb?: ErrorCallback) => {
    capturedCallback = cb;
    if (errCb) capturedErrorCallback = errCb;
    return unsubscribe;
  }),
}));

import { useCycle } from "../features/cycle/useCycle";

function CycleProbe() {
  const { data: cycle, error } = useCycle();
  return (
    <>
      <p>{cycle ? `${cycle.stage}/${cycle.status}` : "none"}</p>
      {error && <p>error: {error.message}</p>}
    </>
  );
}

const BASE_CFG = {
  target: 8, maxIter: 4, budget: 0.6, nSug: 2, auto: false,
  weights: { code: 1, model: 1, human: 1 },
  models: { execution: "m", grading: "m", suggestions: "m", datasetGen: "m" },
};

function cycleDoc(overrides: Record<string, unknown> = {}) {
  return {
    promptId: "p1", projectId: "j1", status: "active", stage: "dataset",
    iteration: 0, spent: 0, scores: [], endReason: null, bestN: null, warnedFlat: false,
    currentVersionN: null, currentRunId: null, pending: null,
    configSnapshot: BASE_CFG, log: [], startedBy: "u1",
    ...overrides,
  };
}

describe("useCycle", () => {
  it("returns null when no cycle is active (empty query result)", async () => {
    render(<CycleProbe />);
    expect(capturedCallback).toBeTypeOf("function");
    await act(async () => {
      capturedCallback?.({ empty: true, docs: [] });
    });
    expect(screen.getByText("none")).toBeInTheDocument();
  });

  it("parses the active cycle document, converting a Firestore Timestamp log entry to an ISO string", async () => {
    render(<CycleProbe />);
    await act(async () => {
      capturedCallback?.({
        empty: false,
        docs: [
          {
            id: "c1",
            data: () =>
              cycleDoc({
                stage: "suggesting",
                log: [{ message: "Cycle started.", ts: { toDate: () => new Date("2026-09-06T00:00:00.000Z") } }],
              }),
          },
        ],
      });
    });
    expect(screen.getByText("suggesting/active")).toBeInTheDocument();
  });

  it("keeps returning the most recent cycle after it ends, so the ended-cycle card (and 'new cycle from best', AC-9.4) stays reachable", async () => {
    // Regression: querying only status=="active" means a cycle vanishes from this hook the
    // instant it ends, making CycleEndedCard's cycleIsHere && cycle.status==="ended" trigger
    // permanently unreachable. The query must be "most recent cycle" (any status), not
    // "the active one" — callers that need "is a cycle blocking things right now" already
    // check cycle.status === "active" explicitly.
    render(<CycleProbe />);
    await act(async () => {
      capturedCallback?.({
        empty: false,
        docs: [{ id: "c1", data: () => cycleDoc({ status: "ended", stage: "ended", endReason: "target-met" }) }],
      });
    });
    expect(screen.getByText("ended/ended")).toBeInTheDocument();
  });

  it("surfaces a schema-parse failure into the returned error instead of crashing the listener", async () => {
    render(<CycleProbe />);
    await act(async () => {
      capturedCallback?.({
        empty: false,
        docs: [{ id: "c1", data: () => ({ stage: "not-a-real-stage" }) }],
      });
    });
    expect(screen.getByText(/^error:/)).toBeInTheDocument();
  });

  it("surfaces a Firestore-level error via onSnapshot's error callback", async () => {
    render(<CycleProbe />);
    expect(capturedErrorCallback).toBeTypeOf("function");
    await act(async () => {
      capturedErrorCallback?.(new Error("permission-denied"));
    });
    expect(screen.getByText("error: permission-denied")).toBeInTheDocument();
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = render(<CycleProbe />);
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
