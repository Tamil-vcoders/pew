// web/features/settings-global/settingsApi.ts
import { apiFetch } from "@/shared/api/client";
import {
  ModelRegistryEntrySchema,
  ModelRegistrySchema,
  PrivacySettingsSchema,
  UserSchema,
  type ModelRegistry,
  type ModelRegistryEntry,
  type PrivacySettings,
  type User,
} from "@/shared/types";

export const settingsApi = {
  async getModelRegistry(): Promise<ModelRegistry> {
    return ModelRegistrySchema.parse(await apiFetch<unknown>("/admin/model-registry"));
  },

  async patchModelRegistry(
    modelId: string,
    patch: { rateInPer1M?: number; rateOutPer1M?: number; enabled?: boolean },
  ): Promise<ModelRegistryEntry> {
    // The response is the one updated entry (plus its id), not the full registry map —
    // see ModelRegistryEntrySchema's note in shared/types/index.ts.
    return ModelRegistryEntrySchema.parse(
      await apiFetch<unknown>("/admin/model-registry", {
        method: "PATCH",
        body: JSON.stringify({ modelId, ...patch }),
      }),
    );
  },

  async getPrivacy(): Promise<PrivacySettings> {
    return PrivacySettingsSchema.parse(await apiFetch<unknown>("/admin/privacy"));
  },

  async patchPrivacy(patch: Partial<PrivacySettings>): Promise<PrivacySettings> {
    return PrivacySettingsSchema.parse(
      await apiFetch<unknown>("/admin/privacy", { method: "PATCH", body: JSON.stringify(patch) }),
    );
  },

  async updateProfileName(name: string): Promise<User> {
    return UserSchema.parse(
      await apiFetch<unknown>("/me", { method: "PATCH", body: JSON.stringify({ name }) }),
    );
  },

  async deleteAccount(): Promise<void> {
    await apiFetch<void>("/me", { method: "DELETE" });
  },
};
