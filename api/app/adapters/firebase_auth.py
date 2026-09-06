# api/app/adapters/firebase_auth.py
"""Thin async wrappers around firebase_admin.auth calls used outside app/deps.py — keeps
direct Firebase Admin SDK calls out of route/service bodies, consistent with the existing
layering even though the hard "no google.* imports" rule only names app/domain/.
"""
from __future__ import annotations

import asyncio

from firebase_admin import auth as fb_auth


async def revoke_user_sessions(uid: str) -> None:
    """Blocks minting a *new* ID token on refresh for `uid`. Does not invalidate an
    already-issued, unexpired (<=1h) token — that would need verify_id_token(...,
    check_revoked=True), an extra network round-trip per request this app does not make (see
    app.services.admin.change_member_role for the full reasoning)."""
    await asyncio.to_thread(fb_auth.revoke_refresh_tokens, uid)


async def delete_auth_user(uid: str) -> None:
    await asyncio.to_thread(fb_auth.delete_user, uid)
