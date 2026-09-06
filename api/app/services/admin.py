# api/app/services/admin.py
"""Member/role administration — US-11/US-18. Pulled out of routes/admin.py so the AC-11.4
last-administrator guard and the audit trail are unit-testable without an HTTP client.
"""
from __future__ import annotations

from app.adapters.firebase_auth import revoke_user_sessions
from app.domain.models import ROLES, User
from app.ports.repos import AuditRepo, UserRepo


async def change_member_role(
    *, target_uid: str, new_role: str, actor: User, users: UserRepo, audit: AuditRepo
) -> User:
    if new_role not in ROLES:
        raise ValueError(f"Unknown role {new_role!r}")

    target = await users.get(target_uid)
    if target is None:
        raise LookupError("User not found")

    if target.role == "administrator" and new_role != "administrator":
        # AC-11.4: never leave the org with zero administrators.
        admins = [u for u in await users.list_all() if u.role == "administrator"]
        if len(admins) <= 1:
            raise ValueError("Cannot demote the organization's last administrator")

    updated = await users.update_role(target_uid, new_role)
    await audit.append(
        actor=actor.uid, action="role-change", subject=target_uid,
        before={"role": target.role}, after={"role": new_role},
    )
    # Is revocation the right mechanism here? current_user (app.deps) already reads role
    # fresh from Firestore on every request, never from token claims — so the new role is
    # already in effect on the target's very next request regardless of this call.
    # revoke_refresh_tokens only blocks minting a *new* ID token on refresh; it does not
    # invalidate an already-issued, unexpired (<=1h) token unless verify_id_token is called
    # with check_revoked=True, which this app deliberately does not do (an extra network
    # round-trip per request, not needed since the role check is already correct without it).
    # Called anyway for prototype-copy parity and defense-in-depth (forces re-auth within
    # <=1h) — a deliberate choice, not a silent no-op.
    await revoke_user_sessions(target_uid)
    return updated
