import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// CycleBanner imports EstimateTable/runsApi via the runs feature's public index, which
// also re-exports RunTab/useRunStream — both of which ultimately import
// shared/firebase/client. Stub it the same way tests/suggestion-card.test.tsx does.
vi.mock("../shared/firebase/client", () => ({ auth: { currentUser: null }, db: {} }));

import { CycleBanner } from "../features/cycle/CycleBanner";
import type { Cycle } from "../shared/types";

const CAN_EDIT = { edit: true, settings: true, admin: false };

const BASE_CFG = {
  target: 8, maxIter: 4, budget: 0.6, nSug: 2, auto: false,
  weights: { code: 1, model: 1, human: 1 },
  models: { execution: "m", grading: "m", suggestions: "m", datasetGen: "m" },
};

function cycle(overrides: Partial<Cycle>): Cycle {
  return {
    id: "c1", promptId: "p1", projectId: "j1", status: "active", stage: "dataset",
    iteration: 0, spent: 0, scores: [], endReason: null, bestN: null, warnedFlat: false,
    currentVersionN: null, currentRunId: null, pending: null,
    configSnapshot: BASE_CFG, log: [], startedBy: "u1",
    ...overrides,
  };
}

describe("CycleBanner stage copy", () => {
  it("dataset stage shows the approve-dataset pause", () => {
    render(<CycleBanner cycle={cycle({ stage: "dataset" })} draft="x" can={CAN_EDIT} onStop={vi.fn()} />);
    expect(screen.getByText("Paused: review the dataset")).toBeInTheDocument();
    expect(screen.getByText("Approve dataset & continue")).toBeInTheDocument();
  });

  it("preview stage shows the iteration projection with remaining budget", () => {
    render(<CycleBanner cycle={cycle({ stage: "preview", iteration: 0, spent: 0.1 })} draft="x" can={CAN_EDIT} onStop={vi.fn()} />);
    expect(screen.getByText("Iteration 1 — projected cost before it starts")).toBeInTheDocument();
    expect(screen.getByText(/Remaining budget: \$0.5000/)).toBeInTheDocument();
    expect(screen.getByText("Confirm & run iteration")).toBeInTheDocument();
  });

  it("running stage shows a lightweight in-progress note", () => {
    render(<CycleBanner cycle={cycle({ stage: "running", iteration: 1 })} draft="x" can={CAN_EDIT} onStop={vi.fn()} />);
    expect(screen.getByText("Iteration 1 running…")).toBeInTheDocument();
  });

  it("grading stage shows the grade-review pause", () => {
    render(<CycleBanner cycle={cycle({ stage: "grading" })} draft="x" can={CAN_EDIT} onStop={vi.fn()} />);
    expect(screen.getByText("Paused: review grades")).toBeInTheDocument();
    expect(screen.getByText("Continue to checks")).toBeInTheDocument();
  });

  it("flat-score warning (checking + warnedFlat) offers continue-or-stop", () => {
    render(
      <CycleBanner cycle={cycle({ stage: "checking", warnedFlat: true })} draft="x" can={CAN_EDIT} onStop={vi.fn()} />,
    );
    expect(screen.getByText("Cycle may not be converging")).toBeInTheDocument();
    expect(screen.getByText("Continue anyway")).toBeInTheDocument();
    expect(screen.getByText("Stop cycle")).toBeInTheDocument();
  });

  it("checking without warnedFlat renders nothing (transient, not a persisted pause)", () => {
    const { container } = render(
      <CycleBanner cycle={cycle({ stage: "checking", warnedFlat: false })} draft="x" can={CAN_EDIT} onStop={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("suggesting stage shows candidate selection with a diff per candidate", () => {
    render(
      <CycleBanner
        cycle={cycle({
          stage: "suggesting",
          pending: {
            selected: 0,
            candidates: [
              { ruleId: "clear", technique: "Clear and direct", evidence: "hedging", oldText: "a", newText: "b" },
            ],
          },
        })}
        draft="x"
        can={CAN_EDIT}
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByText(/Paused: 1 candidate — select one to continue/)).toBeInTheDocument();
    expect(screen.getByText("Clear and direct")).toBeInTheDocument();
    expect(screen.getByText("Apply selected & continue")).toBeInTheDocument();
    expect(screen.getByText("Continue with my edits")).toBeInTheDocument();
  });

  it("viewer role sees the read-only caption instead of action buttons", () => {
    render(
      <CycleBanner
        cycle={cycle({ stage: "dataset" })}
        draft="x"
        can={{ edit: false, settings: false, admin: false }}
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByText(/Viewer role — read-only/)).toBeInTheDocument();
    expect(screen.queryByText("Approve dataset & continue")).not.toBeInTheDocument();
  });
});
