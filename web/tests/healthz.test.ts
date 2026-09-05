import { describe, expect, it } from "vitest";
import { GET } from "../app/api/healthz/route";

describe("healthz", () => {
  it("returns ok", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});
