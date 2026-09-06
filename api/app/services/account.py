# api/app/services/account.py
"""Self-service account deletion — devspec F11's danger zone."""
from __future__ import annotations

from app.adapters.firebase_auth import delete_auth_user, revoke_user_sessions
from app.domain.models import User
from app.ports.repos import AuditRepo, UserRepo


async def delete_own_account(user: User, *, users: UserRepo, audit: AuditRepo) -> None:
    """Revoke refresh tokens -> delete the Firebase Auth user -> anonymize the user doc (kept,
    not deleted, since auditLogs entries reference actor uids by id and must keep resolving)
    -> record the deletion itself in the audit trail."""
    await revoke_user_sessions(user.uid)
    await delete_auth_user(user.uid)
    await users.anonymize(user.uid)
    await audit.append(
        actor=user.uid, action="account-deleted", subject=user.uid,
        before={"name": user.name, "email": user.email, "role": user.role}, after=None,
    )
