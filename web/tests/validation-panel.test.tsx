import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ValidationPanel } from "../features/validation/ValidationPanel";
import type { ValidationResult } from "../features/validation/rules";

const results: ValidationResult[] = [
  { id: "clear", name: "Clear and direct", status: "fail", reason: 'Hedging language ("try to")...' },
  { id: "specific", name: "Be specific", status: "pass", reason: "An explicit output format is specified." },
  { id: "xml", name: "XML structure", status: "n/a", reason: "No template variables to wrap." },
];

describe("ValidationPanel", () => {
  it("renders one row per rule with its name and reason", () => {
    render(<ValidationPanel results={results} />);
    expect(screen.getByText("Clear and direct")).toBeInTheDocument();
    expect(screen.getByText(/Hedging language/)).toBeInTheDocument();
    expect(screen.getByText("Be specific")).toBeInTheDocument();
    expect(screen.getByText("XML structure")).toBeInTheDocument();
  });

  it("advertises zero model calls", () => {
    render(<ValidationPanel results={results} />);
    expect(screen.getByText(/0 model calls/)).toBeInTheDocument();
  });
});
