// web/app/(workspace)/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/useAuth";
import { readLastPrompt } from "@/features/workspace/lastPrompt";
import { COLORS } from "@/shared/ui/tokens";

export default function WorkspaceHome() {
  const router = useRouter();
  const { profile } = useAuth();
  // Land back on the prompt this user last had open (e.g. returning from Global settings via
  // its "Back" button, which routes to "/"). Decided in an effect, not during render: the
  // stored value lives in localStorage, which SSR can't read and which would otherwise make
  // the server and first client render disagree.
  const [redirecting, setRedirecting] = useState(false);
  useEffect(() => {
    if (!profile) return;
    const last = readLastPrompt(profile.uid);
    if (last) {
      setRedirecting(true);
      router.replace(`/p/${last.promptId}?project=${last.projectId}`);
    }
  }, [profile, router]);

  if (redirecting) {
    return <div style={{ padding: 18, color: COLORS.muted, fontSize: 13 }}>Loading…</div>;
  }
  return (
    <div style={{ padding: 18, color: COLORS.muted, fontSize: 13 }}>
      Select a prompt from the tree on the left, or create one to get started.
    </div>
  );
}
