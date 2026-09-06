// web/features/members/membersApi.ts
import { z } from "zod";
import { apiFetch } from "@/shared/api/client";
import { AuditEntrySchema, MemberSchema, type AuditEntry, type Member } from "@/shared/types";
import type { Role } from "@/shared/rbac/permissions";

export const membersApi = {
  async list(): Promise<Member[]> {
    return z.array(MemberSchema).parse(await apiFetch<unknown>("/admin/members"));
  },

  async setRole(uid: string, role: Role): Promise<Member> {
    return MemberSchema.parse(
      await apiFetch<unknown>(`/admin/members/${uid}/role`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      }),
    );
  },

  async listAudit(): Promise<AuditEntry[]> {
    return z.array(AuditEntrySchema).parse(await apiFetch<unknown>("/admin/audit"));
  },
};
