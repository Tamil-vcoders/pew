// web/tests/version-history.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VersionHistory } from "../features/editor/VersionHistory";
import type { Version } from "../shared/types";

const versions: Version[] = [
  { n: 2, text: "v2", note: "Applied: Clear and direct", technique: "Clear and direct", createdBy: "u1", createdAt: null },
  { n: 1, text: "v1", note: "Initial draft", technique: null, createdBy: "u1", createdAt: null },
];

describe("VersionHistory", () => {
  it("renders nothing with only one version", () => {
    const { container } = render(<VersionHistory versions={[versions[1]]} currentVersionN={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists every version with its note and technique", () => {
    render(<VersionHistory versions={versions} currentVersionN={2} />);
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText(/Applied: Clear and direct/)).toBeInTheDocument();
    // Both the note text and the technique parenthetical render "Clear and direct",
    // so a substring regex match finds two elements — assert both are present.
    expect(screen.getAllByText(/Clear and direct/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  it("renders no score badge when scoreByVersion is empty (Phase 3 supplies scores)", () => {
    render(<VersionHistory versions={versions} currentVersionN={2} />);
    expect(screen.queryByText(/\d\.\d/)).not.toBeInTheDocument();
  });

  it("renders a score badge for a version present in scoreByVersion", () => {
    render(<VersionHistory versions={versions} currentVersionN={2} scoreByVersion={{ 1: 8.4 }} />);
    expect(screen.getByText("8.4")).toBeInTheDocument();
  });
});
