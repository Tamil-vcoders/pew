// web/tests/model-registry-section.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/api/client", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "../shared/api/client";
import { ModelRegistrySection } from "../features/settings-global/ModelRegistrySection";
import { ToastProvider } from "../shared/ui";
import type { ModelRegistry } from "../shared/types";

const registry: ModelRegistry = {
  "gemini-3.1-pro-preview": { label: "Gemini 3.1 Pro Preview", rateInPer1M: 2, rateOutPer1M: 12, enabled: true },
  "gemini-3.6-flash": { label: "Gemini 3.6 Flash", rateInPer1M: 0.75, rateOutPer1M: 3.75, enabled: true },
};
const can = { edit: true, settings: true, admin: true };

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("ModelRegistrySection", () => {
  it(
    "regression: PATCH /admin/model-registry returns the one updated entry (not the full " +
      "registry map) — settingsApi must parse it without throwing, and the section must merge " +
      "it into the existing registry rather than replace the whole map",
    async () => {
      // This is the real backend response shape (see api/app/routes/admin.py::patch_model_registry):
      // {modelId, label, rateInPer1M, rateOutPer1M, enabled} — a single entry plus its id, never a
      // Record<string, ModelRates>. An earlier bug parsed this against the full-registry schema
      // (ModelRegistrySchema), which silently threw inside settingsApi.patchModelRegistry — the
      // request succeeded server-side but the checkbox/rate never updated on screen until a full
      // page reload, because the throw meant ModelRegistrySection's onChange was never called.
      vi.mocked(apiFetch).mockResolvedValue({
        modelId: "gemini-3.1-pro-preview",
        label: "Gemini 3.1 Pro Preview",
        rateInPer1M: 2,
        rateOutPer1M: 12,
        enabled: false,
      });

      const onChange = vi.fn();
      render(
        <ToastProvider>
          <ModelRegistrySection registry={registry} onChange={onChange} can={can} />
        </ToastProvider>,
      );

      // The first "enabled" checkbox belongs to gemini-3.1-pro-preview (registry insertion order).
      fireEvent.click(screen.getAllByRole("checkbox", { name: "enabled" })[0]);

      await vi.waitFor(() => expect(onChange).toHaveBeenCalled());

      // Merge, not replace: gemini-3.6-flash's entry must survive untouched alongside the update.
      expect(onChange).toHaveBeenCalledWith({
        "gemini-3.1-pro-preview": { label: "Gemini 3.1 Pro Preview", rateInPer1M: 2, rateOutPer1M: 12, enabled: false },
        "gemini-3.6-flash": { label: "Gemini 3.6 Flash", rateInPer1M: 0.75, rateOutPer1M: 3.75, enabled: true },
      });

      // And the parse must not have thrown into the error-toast path.
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );
});
