// web/tests/active-prompt-header.test.tsx
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  ActivePromptHeaderProvider,
  useActivePromptHeader,
  type ActivePromptHeaderData,
} from "../features/workspace/ActivePromptHeader";

const SAMPLE: ActivePromptHeaderData = {
  projectName: "Support automation",
  promptName: "Ticket triage",
  tags: ["triage", "prod"],
  latestVersion: 1,
  isDirty: false,
  archived: false,
  canEdit: true,
  canSettings: true,
  onRename: vi.fn(),
  onTagsChange: vi.fn(),
  onToggleArchive: vi.fn(),
  onRunOnce: vi.fn(),
};

function Reader() {
  const { header } = useActivePromptHeader();
  return <p>{header ? `${header.projectName} / ${header.promptName}` : "no active prompt"}</p>;
}

function Publisher({ header }: { header: ActivePromptHeaderData | null }) {
  const { setHeader } = useActivePromptHeader();
  useEffect(() => {
    setHeader(header);
  }, [header, setHeader]);
  return null;
}

describe("ActivePromptHeader context", () => {
  it("starts with no active prompt", () => {
    render(
      <ActivePromptHeaderProvider>
        <Reader />
      </ActivePromptHeaderProvider>,
    );
    expect(screen.getByText("no active prompt")).toBeInTheDocument();
  });

  it("lets a descendant publish header data for another descendant to read", async () => {
    render(
      <ActivePromptHeaderProvider>
        <Publisher header={SAMPLE} />
        <Reader />
      </ActivePromptHeaderProvider>,
    );
    expect(await screen.findByText("Support automation / Ticket triage")).toBeInTheDocument();
  });

  it("clears back to no active prompt when the publisher sets null (e.g. navigating away)", async () => {
    const { rerender } = render(
      <ActivePromptHeaderProvider>
        <Publisher header={SAMPLE} />
        <Reader />
      </ActivePromptHeaderProvider>,
    );
    await screen.findByText("Support automation / Ticket triage");
    rerender(
      <ActivePromptHeaderProvider>
        <Publisher header={null} />
        <Reader />
      </ActivePromptHeaderProvider>,
    );
    expect(await screen.findByText("no active prompt")).toBeInTheDocument();
  });

  it("throws when used outside a provider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Reader />)).toThrow(
      "useActivePromptHeader must be used within an ActivePromptHeaderProvider",
    );
    consoleError.mockRestore();
  });
});
