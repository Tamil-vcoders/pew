// web/features/settings-global/GlobalSettingsPage.tsx — ports the GlobalSettings function's
// composition from docs/prototype.jsx:579-731: back button + heading, then Profile, Security,
// "Your API keys", Model registry, Members (admin only), Privacy, Danger zone in that exact
// order. Members is rendered from inside here (a cross-feature import of its public index.ts)
// gated on `can.admin`, matching the prototype's placement of Members *inside* Global Settings.
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, COLORS } from "@/shared/ui";
import { MembersPanel } from "@/features/members";
import type { Capabilities } from "@/shared/rbac/permissions";
import type { ModelRegistry, PrivacySettings, User } from "@/shared/types";
import { ApiKeysSection } from "./ApiKeysSection";
import { DangerZoneSection } from "./DangerZoneSection";
import { ModelRegistrySection } from "./ModelRegistrySection";
import { PrivacySection } from "./PrivacySection";
import { ProfileSection } from "./ProfileSection";
import { SecuritySection } from "./SecuritySection";
import { settingsApi } from "./settingsApi";

export function GlobalSettingsPage({ profile, can }: { profile: User; can: Capabilities }) {
  const router = useRouter();
  const [registry, setRegistry] = useState<ModelRegistry | null>(null);
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([settingsApi.getModelRegistry(), settingsApi.getPrivacy()])
      .then(([r, p]) => {
        if (cancelled) return;
        setRegistry(r);
        setPrivacy(p);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load settings.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ padding: 20, maxWidth: 720, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Btn tone="ghost" small onClick={() => router.push("/")}>
          ← Back
        </Btn>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Global settings</span>
        <span style={{ fontSize: 11, color: COLORS.faint }}>account-level — applies across all projects</span>
      </div>

      {loadError && <div style={{ fontSize: 11.5, color: COLORS.bad }}>{loadError}</div>}

      <ProfileSection profile={profile} />
      <SecuritySection />
      <ApiKeysSection />

      {loading ? (
        <div style={{ fontSize: 11.5, color: COLORS.faint }}>Loading…</div>
      ) : (
        <>
          {registry && <ModelRegistrySection registry={registry} onChange={setRegistry} can={can} />}
          {can.admin && <MembersPanel />}
          {privacy && <PrivacySection privacy={privacy} onChange={setPrivacy} can={can} />}
        </>
      )}

      <DangerZoneSection />
    </div>
  );
}
