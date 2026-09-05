// web/tests/role-badge.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoleBadge } from "../shared/ui/RoleBadge";

describe("RoleBadge", () => {
  it("renders the role name", () => {
    render(<RoleBadge role="maintainer" />);
    expect(screen.getByText("maintainer")).toBeInTheDocument();
  });
});
