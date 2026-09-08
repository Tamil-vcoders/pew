import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EstimateTable } from "../features/runs/EstimateTable";
import type { Estimate } from "../shared/types";

const twoRowEstimate: Estimate = {
  rows: [
    { stage: "Execution", model: "gemini-3.1-pro-preview", tokensIn: 1500, tokensOut: 700, cost: 0.01 },
    { stage: "Model grading", model: "gemini-3.6-flash", tokensIn: 2800, tokensOut: 400, cost: 0.002 },
  ],
  totalIn: 4300, totalOut: 1100, totalCost: 0.012, nCases: 1,
};

const cycleEstimate: Estimate = {
  rows: [
    ...twoRowEstimate.rows,
    { stage: "Suggestions", model: "gemini-3.6-flash", tokensIn: 5000, tokensOut: 1500, cost: 0.004 },
  ],
  totalIn: 9300, totalOut: 2600, totalCost: 0.016, nCases: 1,
};

describe("EstimateTable", () => {
  it("labels the total row 'Per run' for a plain (no Suggestions row) estimate", () => {
    render(<EstimateTable estimate={twoRowEstimate} />);
    expect(screen.getByText("Per run (1 cases)")).toBeInTheDocument();
    expect(screen.queryByText(/Per iteration/)).not.toBeInTheDocument();
  });

  it("labels the total row 'Per iteration' once a Suggestions row is present (cycle-preview estimate)", () => {
    render(<EstimateTable estimate={cycleEstimate} />);
    expect(screen.getByText("Per iteration (1 cases)")).toBeInTheDocument();
    expect(screen.queryByText(/Per run/)).not.toBeInTheDocument();
  });
});
