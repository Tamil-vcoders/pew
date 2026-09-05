// web/tests/api-client.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/firebase/client", () => ({
  auth: { currentUser: null },
}));

import { auth } from "../shared/firebase/client";
import { apiFetch, ApiError } from "../shared/api/client";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:8000");
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("attaches the signed-in user's ID token as a bearer header", async () => {
    (auth as unknown as { currentUser: unknown }).currentUser = {
      getIdToken: vi.fn().mockResolvedValue("token-123"),
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const result = await apiFetch<{ ok: boolean }>("/projects");

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/projects");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer token-123" });
  });

  it("throws ApiError with the status and server message on a non-2xx response", async () => {
    (auth as unknown as { currentUser: unknown }).currentUser = {
      getIdToken: vi.fn().mockResolvedValue("token-123"),
    };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Requires maintainer role" }), { status: 403 }),
    );

    await expect(apiFetch("/projects", { method: "POST" })).rejects.toMatchObject(
      new ApiError(403, "Requires maintainer role"),
    );
  });

  it("throws ApiError(401) without calling fetch when no user is signed in", async () => {
    (auth as unknown as { currentUser: unknown }).currentUser = null;
    await expect(apiFetch("/me")).rejects.toMatchObject(new ApiError(401, "Not signed in"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
