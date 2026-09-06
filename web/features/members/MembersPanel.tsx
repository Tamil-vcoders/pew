// web/features/members/MembersPanel.tsx — ports docs/prototype.jsx:680-699 (the "Members
// (administrator only)" section). Entirely gated by `can.admin` at the call site (rendered
// only from inside GlobalSettingsPage.tsx when `can.admin` is true) — this component does not
// re-check the capability itself.
"use client";
import { useEffect, useState } from "react";
import { COLORS, useToast } from "@/shared/ui";
import { ROLE_LEVEL, type Role } from "@/shared/rbac/permissions";
import type { AuditEntry, Member } from "@/shared/types";
import { membersApi } from "./membersApi";

function describeAuditEntry(entry: AuditEntry): string {
  const when = new Date(entry.ts).toLocaleString();
  const beforeRole = entry.before && typeof entry.before.role === "string" ? entry.before.role : null;
  const afterRole = entry.after && typeof entry.after.role === "string" ? entry.after.role : null;
  const change = beforeRole && afterRole ? `: ${beforeRole} → ${afterRole}` : "";
  return `${when} · ${entry.actor} · ${entry.action} · ${entry.subject}${change}`;
}

export function MembersPanel() {
  const { showError } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all([membersApi.list(), membersApi.listAudit()])
      .then(([m, a]) => {
        if (cancelled) return;
        setMembers(m);
        setAudit(a);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load members.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  async function changeRole(uid: string, role: Role) {
    setPending((p) => ({ ...p, [uid]: true }));
    try {
      const updated = await membersApi.setRole(uid, role);
      setMembers((prev) => prev.map((m) => (m.uid === uid ? updated : m)));
      setAudit(await membersApi.listAudit());
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to change role.");
    } finally {
      setPending((p) => ({ ...p, [uid]: false }));
    }
  }

  return (
    <div style={{ border: `0.5px solid ${COLORS.border}`, borderRadius: 10, padding: 14, background: COLORS.surface }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Members (administrator only)</div>
      {loadError && <div style={{ fontSize: 11.5, color: COLORS.bad, marginBottom: 8 }}>{loadError}</div>}
      {loading ? (
        <div style={{ fontSize: 11.5, color: COLORS.faint }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {members.map((m) => (
              <div
                key={m.uid}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: COLORS.surface2, fontSize: 12 }}
              >
                <span style={{ flex: 1 }}>
                  {m.name}{" "}
                  <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: COLORS.faint }}>{m.email}</span>
                </span>
                <select
                  value={m.role}
                  disabled={!!pending[m.uid]}
                  onChange={(e) => changeRole(m.uid, e.target.value as Role)}
                  style={{
                    width: 130, padding: "4px 6px", fontSize: 11, fontFamily: "ui-monospace, monospace",
                    background: "#0F1116", color: COLORS.text, border: `0.5px solid ${COLORS.border}`, borderRadius: 6,
                  }}
                >
                  {Object.keys(ROLE_LEVEL).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div
            style={{
              fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: COLORS.faint, lineHeight: 1.7,
              marginTop: 8, maxHeight: 80, overflow: "auto",
            }}
          >
            {audit.length > 0 ? (
              audit.map((a, i) => <div key={i}>{describeAuditEntry(a)}</div>)
            ) : (
              <div>No audit entries yet.</div>
            )}
          </div>
        </>
      )}
      <div style={{ fontSize: 10.5, color: COLORS.faint, marginTop: 8, lineHeight: 1.6 }}>
        Role changes are audit-logged (AC-18.1). A role change also revokes the member&apos;s
        Firebase refresh tokens so stale claims can&apos;t linger.
      </div>
    </div>
  );
}
