// web/tests/setup-tab.test.tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/features/runs", () => ({
  runsApi: { estimate: vi.fn() },
  EstimateTable: () => <div data-testid="estimate-table" />,
  fmt$: (v: number) => "$" + v.toFixed(3),
  fmtK: (v: number) => (v >= 1000 ? (v / 1000).toFixed(1) + "k" : String(v)),
}));
vi.mock("@/features/cycle", () => ({
  CycleEndedCard: () => null,
  CycleLog: () => null,
  cycleApi: { start: vi.fn() },
}));
vi.mock("@/features/workspace", () => ({
  workspaceApi: { updateCfg: vi.fn() },
}));
vi.mock("@/features/settings-global", () => ({
  settingsApi: { getModelRegistry: vi.fn() },
}));
vi.mock("../features/setup/ModelStageSelect", () => ({
  ModelStageSelect: () => <div data-testid="model-stage-select" />,
}));

import { runsApi } from "@/features/runs";
import { settingsApi } from "@/features/settings-global";
import { SetupTab } from "../features/setup/SetupTab";
import type { Capabilities } from "../shared/rbac/permissions";
import type { Project } from "../shared/types";

const CAN_ALL: Capabilities = { edit: true, settings: true, admin: true };

const project: Project = {
  id: "j1",
  name: "Support automation",
  cfg: {
    target: 8, maxIter: 4, budget: 0.6, nSug: 2, auto: false,
    weights: { code: 1, model: 1, human: 1 },
    models: { execution: "gemini-3.1-pro-preview", grading: "gemini-3.6-flash", suggestions: "gemini-3.6-flash", datasetGen: "gemini-3.6-flash" },
  },
};

function renderSetupTab(overrides: Partial<Parameters<typeof SetupTab>[0]> = {}) {
  return render(
    <SetupTab
      projectId="j1"
      promptId="p1"
      promptName="Ticket triage"
      project={project}
      draft="Summarize: {{ticket_text}}"
      cases={[]}
      versions={[]}
      can={CAN_ALL}
      cycle={null}
      cycleIsHere={false}
      anyCycleActive={false}
      onCycleStarted={vi.fn()}
      onNewCycleFromBest={vi.fn()}
      onCycleCleared={vi.fn()}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.mocked(runsApi.estimate).mockReset();
  vi.mocked(runsApi.estimate).mockResolvedValue({ rows: [], totalIn: 0, totalOut: 0, totalCost: 0, nCases: 0 });
  vi.mocked(settingsApi.getModelRegistry).mockReset();
  vi.mocked(settingsApi.getModelRegistry).mockResolvedValue({});
});

describe("SetupTab", () => {
  it("names the project in the cycle-defaults and models-per-stage headings", () => {
    renderSetupTab();
    expect(screen.getByText("Cycle defaults — Support automation")).toBeInTheDocument();
    expect(screen.getByText("Models per stage — Support automation")).toBeInTheDocument();
  });

  it("requests the cycle-preview estimate (with nSug) rather than the one-off run estimate", () => {
    renderSetupTab();
    expect(runsApi.estimate).toHaveBeenCalledWith("j1", "p1", "Summarize: {{ticket_text}}", 2);
  });

  it("points to Global settings for a personal API key, since none is saved (org/mock credentials)", () => {
    renderSetupTab();
    expect(screen.getByText(/No personal API key saved/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Global settings" })).toHaveAttribute("href", "/settings");
  });

  it("summarizes the full cycle's cost and tokens beneath the estimate table", async () => {
    vi.mocked(runsApi.estimate).mockResolvedValue({
      rows: [], totalIn: 48700, totalOut: 12900, totalCost: 0.203, nCases: 9,
    });
    renderSetupTab();
    expect(await screen.findByText(/Full cycle \(4 iterations\): ~\$0\.812 · 246\.4k tokens/)).toBeInTheDocument();
  });

  it("shows the affordability warning without the old execution-only caveat, now that the estimate already includes suggestions", async () => {
    // budget (0.6) / totalCost (0.19) = 3.157... -- deliberately not an exact integer
    // boundary, so Math.floor's result (3) is stable regardless of floating-point error.
    vi.mocked(runsApi.estimate).mockResolvedValue({
      rows: [], totalIn: 1, totalOut: 1, totalCost: 0.19, nCases: 1,
    });
    renderSetupTab();
    expect(await screen.findByText(/covers only ~3 of 4 configured iterations/)).toBeInTheDocument();
    expect(screen.queryByText(/execution \+ grading only/)).not.toBeInTheDocument();
  });
});
