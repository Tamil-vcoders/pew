import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (snap: unknown) => void;
type ErrorHandler = (err: Error) => void;
const listeners = new Map<string, { onNext: Handler; onError: ErrorHandler; unsub: ReturnType<typeof vi.fn> }>();

function pathFor(...segments: string[]): string {
  return segments.join("/");
}

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...segments: string[]) => ({ __path: pathFor(...segments) }),
  query: (ref: { __path: string }, ..._rest: unknown[]) => ref,
  orderBy: () => ({}),
  onSnapshot: (ref: { __path: string }, onNext: Handler, onError: ErrorHandler) => {
    const unsub = vi.fn();
    listeners.set(ref.__path, { onNext, onError, unsub });
    return unsub;
  },
}));
vi.mock("@/shared/firebase/client", () => ({ db: {} }));

import { useVersionsStream } from "../features/editor/useVersionsStream";

function Probe({ projectId, promptId }: { projectId: string; promptId: string }) {
  const { data, error } = useVersionsStream(projectId, promptId);
  if (error) return <div>error: {error.message}</div>;
  return <div>versions: {data.map((v) => v.n).join(",")}</div>;
}

beforeEach(() => listeners.clear());

describe("useVersionsStream", () => {
  it("parses version docs from the snapshot, converting the Firestore timestamp to an ISO string", () => {
    render(<Probe projectId="j1" promptId="p1" />);
    const path = "projects/j1/prompts/p1/versions";
    act(() => {
      listeners.get(path)!.onNext({
        docs: [
          {
            data: () => ({
              n: 2, text: "v2", note: "Applied: Clear and direct", technique: "Clear and direct",
              createdBy: "u1", createdAt: { toDate: () => new Date("2026-09-06T00:00:00.000Z") },
            }),
          },
          {
            data: () => ({
              n: 1, text: "v1", note: null, technique: null, createdBy: "u1", createdAt: null,
            }),
          },
        ],
      });
    });
    expect(screen.getByText("versions: 2,1")).toBeInTheDocument();
  });

  it("surfaces a listener error", () => {
    render(<Probe projectId="j1" promptId="p1" />);
    const path = "projects/j1/prompts/p1/versions";
    act(() => listeners.get(path)!.onError(new Error("permission-denied")));
    expect(screen.getByText("error: permission-denied")).toBeInTheDocument();
  });
});
