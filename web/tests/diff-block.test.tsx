import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiffBlock, diffLines } from "../features/editor/DiffBlock";

describe("diffLines", () => {
  it("marks unchanged lines as same", () => {
    expect(diffLines("a\nb", "a\nb")).toEqual([
      { t: "same", v: "a" },
      { t: "same", v: "b" },
    ]);
  });

  it("marks an added line as add and a removed line as del", () => {
    const result = diffLines("a\nb", "a\nc\nb");
    expect(result).toEqual([
      { t: "same", v: "a" },
      { t: "add", v: "c" },
      { t: "same", v: "b" },
    ]);
  });
});

describe("DiffBlock", () => {
  it("renders removed and added lines with their markers", () => {
    render(<DiffBlock oldText={"Try to help."} newText={"Help."} />);
    expect(screen.getByText("Try to help.")).toBeInTheDocument();
    expect(screen.getByText("Help.")).toBeInTheDocument();
  });
});
