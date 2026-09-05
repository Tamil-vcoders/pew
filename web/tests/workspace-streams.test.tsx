// web/tests/workspace-streams.test.tsx
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

type SnapshotCallback = (snap: unknown) => void;
type FirestoreRef = { __path: string };

// Path-keyed onSnapshot tracking: real Firestore identifies subscriptions by
// the collection/document reference (or query built from one), so the mock
// mirrors that by building a "__path" out of the segments passed to
// collection()/doc(), and recording the onSnapshot callback + unsubscribe spy
// per path. This lets tests for usePromptsStream/usePromptDoc distinguish
// subscriptions for different projectId/promptId values, and assert re-subscribe
// (old path's unsubscribe called) / unsubscribe-on-unmount behavior.
const snapshotCallbacksByPath = new Map<string, SnapshotCallback>();
const unsubscribeSpiesByPath = new Map<string, ReturnType<typeof vi.fn>>();

vi.mock("../shared/firebase/client", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, ...segments: string[]): FirestoreRef => ({
    __path: segments.join("/"),
  })),
  doc: vi.fn((_db: unknown, ...segments: string[]): FirestoreRef => ({
    __path: segments.join("/"),
  })),
  query: vi.fn((ref: FirestoreRef, ..._constraints: unknown[]): FirestoreRef => ref),
  orderBy: vi.fn(),
  onSnapshot: vi.fn((ref: FirestoreRef, cb: SnapshotCallback) => {
    snapshotCallbacksByPath.set(ref.__path, cb);
    const unsubscribe = vi.fn();
    unsubscribeSpiesByPath.set(ref.__path, unsubscribe);
    return unsubscribe;
  }),
}));

import { useProjectsStream } from "../features/workspace/useProjectsStream";
import { usePromptsStream } from "../features/workspace/usePromptsStream";
import { usePromptDoc } from "../features/workspace/usePromptDoc";

function ProjectsProbe() {
  const projects = useProjectsStream();
  return <p>{projects.map((p) => p.name).join(",")}</p>;
}

function PromptsProbe({ projectId }: { projectId: string }) {
  const prompts = usePromptsStream(projectId);
  return <p>{prompts.map((p) => p.name).join(",")}</p>;
}

function PromptDocProbe({ projectId, promptId }: { projectId: string; promptId: string }) {
  const prompt = usePromptDoc(projectId, promptId);
  return <p>{prompt ? prompt.name : "none"}</p>;
}

describe("useProjectsStream", () => {
  it("maps onSnapshot docs into Project objects, ordered as delivered", async () => {
    render(<ProjectsProbe />);
    const callback = snapshotCallbacksByPath.get("projects");
    expect(callback).toBeTypeOf("function");

    await act(async () => {
      callback?.({
        docs: [
          {
            id: "j1",
            data: () => ({
              name: "Support automation",
              cfg: {
                target: 8, maxIter: 4, budget: 0.6, nSug: 2, auto: false,
                weights: { code: 1, model: 1, human: 1 },
                models: { execution: "gemini-2.5-pro", grading: "gemini-2.5-flash", suggestions: "gemini-2.5-flash", datasetGen: "gemini-2.5-flash" },
              },
            }),
          },
        ],
      });
    });
    expect(screen.getByText("Support automation")).toBeInTheDocument();
  });
});

describe("usePromptsStream", () => {
  it("subscribes per project, re-subscribes when projectId changes, and unsubscribes on unmount", async () => {
    const { rerender, unmount } = render(<PromptsProbe projectId="j1" />);

    const j1Path = "projects/j1/prompts";
    const j1Callback = snapshotCallbacksByPath.get(j1Path);
    const j1Unsubscribe = unsubscribeSpiesByPath.get(j1Path);
    expect(j1Callback).toBeTypeOf("function");
    expect(j1Unsubscribe).toBeDefined();

    await act(async () => {
      j1Callback?.({
        docs: [
          {
            id: "p1",
            data: () => ({ name: "Prompt one", tags: [], archived: false, bestScore: null, latestVersion: 1 }),
          },
        ],
      });
    });
    expect(screen.getByText("Prompt one")).toBeInTheDocument();
    expect(j1Unsubscribe).not.toHaveBeenCalled();

    await act(async () => {
      rerender(<PromptsProbe projectId="j2" />);
    });

    // Changing projectId must tear down the old subscription (j1) ...
    expect(j1Unsubscribe).toHaveBeenCalledTimes(1);

    // ... and open a fresh one scoped to the new project (j2).
    const j2Path = "projects/j2/prompts";
    const j2Callback = snapshotCallbacksByPath.get(j2Path);
    const j2Unsubscribe = unsubscribeSpiesByPath.get(j2Path);
    expect(j2Callback).toBeTypeOf("function");
    expect(j2Unsubscribe).toBeDefined();
    expect(j2Unsubscribe).not.toHaveBeenCalled();

    await act(async () => {
      j2Callback?.({
        docs: [
          {
            id: "p2",
            data: () => ({ name: "Prompt two", tags: [], archived: false, bestScore: null, latestVersion: 1 }),
          },
        ],
      });
    });
    expect(screen.getByText("Prompt two")).toBeInTheDocument();

    unmount();
    expect(j2Unsubscribe).toHaveBeenCalledTimes(1);
    // The already-torn-down j1 subscription must not be touched again on unmount.
    expect(j1Unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe("usePromptDoc", () => {
  it("returns a parsed Prompt with the given projectId when the document exists", async () => {
    render(<PromptDocProbe projectId="j1" promptId="p1" />);
    const path = "projects/j1/prompts/p1";
    const callback = snapshotCallbacksByPath.get(path);
    expect(callback).toBeTypeOf("function");

    await act(async () => {
      callback?.({
        id: "p1",
        exists: () => true,
        data: () => ({ name: "Exists prompt", tags: ["draft"], archived: false, bestScore: 0.9, latestVersion: 3 }),
      });
    });

    expect(screen.getByText("Exists prompt")).toBeInTheDocument();
  });

  it("returns null when the document does not exist", async () => {
    render(<PromptDocProbe projectId="j2" promptId="p2" />);
    const path = "projects/j2/prompts/p2";
    const callback = snapshotCallbacksByPath.get(path);
    expect(callback).toBeTypeOf("function");

    await act(async () => {
      callback?.({
        id: "p2",
        exists: () => false,
        data: () => undefined,
      });
    });

    expect(screen.getByText("none")).toBeInTheDocument();
  });
});
