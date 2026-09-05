// web/tests/workspace-streams.test.tsx
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

let projectsCallback: ((snap: unknown) => void) | null = null;

vi.mock("../shared/firebase/client", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn((...args) => args),
  orderBy: vi.fn(),
  onSnapshot: vi.fn((_query, cb) => {
    projectsCallback = cb;
    return () => {};
  }),
}));

import { useProjectsStream } from "../features/workspace/useProjectsStream";

function Probe() {
  const projects = useProjectsStream();
  return <p>{projects.map((p) => p.name).join(",")}</p>;
}

describe("useProjectsStream", () => {
  it("maps onSnapshot docs into Project objects, ordered as delivered", async () => {
    render(<Probe />);
    await act(async () => {
      projectsCallback?.({
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
