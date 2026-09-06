// web/app/(workspace)/settings/page.tsx — thin composition: pages in app/ only compose
// feature components (docs/CLAUDE.md). Mirrors the profile?/loading-guard convention already
// used by app/(workspace)/p/[promptId]/page.tsx.
"use client";
import { useAuth } from "@/features/auth/useAuth";
import { capabilitiesFor } from "@/shared/rbac/permissions";
import { GlobalSettingsPage } from "@/features/settings-global";
import { COLORS } from "@/shared/ui/tokens";

export default function SettingsPage() {
  const { profile } = useAuth();
  const can = capabilitiesFor(profile?.role ?? null);

  if (!profile) {
    return <p style={{ color: COLORS.muted }}>Loading…</p>;
  }
  return <GlobalSettingsPage profile={profile} can={can} />;
}
