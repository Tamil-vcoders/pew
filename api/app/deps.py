# app/deps.py
from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable

import firebase_admin
from fastapi import Depends, Header, HTTPException
from firebase_admin import auth as fb_auth
from google.cloud import firestore

from app.adapters.firestore_repos import FirestoreAuditRepo, FirestoreUserRepo
from app.config import get_settings
from app.domain.models import User
from app.ports.repos import AuditRepo, UserRepo

_firebase_app: firebase_admin.App | None = None
_firestore_client: firestore.AsyncClient | None = None
_firestore_client_loop_id: int | None = None


def get_firebase_app() -> firebase_admin.App:
    global _firebase_app
    if _firebase_app is None:
        _firebase_app = firebase_admin.initialize_app(
            options={"projectId": get_settings().firebase_project_id}
        )
    return _firebase_app


def get_firestore_client() -> firestore.AsyncClient:
    """Return the process-wide `firestore.AsyncClient`, rebuilding it if the currently
    running event loop differs from the one its grpc channel was bound to.

    `firestore.AsyncClient` lazily binds its grpc.aio channel to whatever asyncio event loop
    is running the first time an RPC is actually awaited; reusing that client from a
    *different* (and possibly already-closed) loop later raises
    `RuntimeError: Event loop is closed`. Under uvicorn there is exactly one event loop for
    the server's entire lifetime, so this never triggers in production. It does trigger in
    the integration test suite: `TestClient` spins up a fresh event loop per request (unless
    entered as a context manager) and pytest-asyncio's own async test functions each run on
    their own loop, so this singleton otherwise gets reused across several distinct, dying
    loops within a single test session. Confirmed live against the Firestore emulator.

    When called from a genuinely running event loop (e.g. directly from an `async def`, as
    `current_user` below does) this detects and heals a stale binding. When called from
    FastAPI's sync-dependency threadpool (no event loop visible in that worker thread) the
    check is a no-op and the cached client is returned as-is — harmless, since the real
    binding only happens later, on the first await, from code that *does* run on the actual
    request loop.
    """
    global _firestore_client, _firestore_client_loop_id
    try:
        running_loop_id: int | None = id(asyncio.get_running_loop())
    except RuntimeError:
        running_loop_id = None
    if (
        _firestore_client is not None
        and running_loop_id is not None
        and running_loop_id != _firestore_client_loop_id
    ):
        _firestore_client = None
    if _firestore_client is None:
        get_firebase_app()  # ensure a default app exists before any auth calls happen
        _firestore_client = firestore.AsyncClient(project=get_settings().firebase_project_id)
        _firestore_client_loop_id = running_loop_id
    return _firestore_client


ROLE_LEVEL = {"viewer": 0, "contributor": 1, "maintainer": 2, "administrator": 3}


def get_audit_repo(client: firestore.AsyncClient = Depends(get_firestore_client)) -> AuditRepo:
    return FirestoreAuditRepo(client)


def get_user_repo(
    client: firestore.AsyncClient = Depends(get_firestore_client),
    audit: AuditRepo = Depends(get_audit_repo),
) -> UserRepo:
    return FirestoreUserRepo(client, audit)


async def current_user(authorization: str = Header(...)) -> User:
    get_firebase_app()
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    try:
        decoded = fb_auth.verify_id_token(authorization.removeprefix("Bearer "))
    except Exception as exc:
        raise HTTPException(401, "Invalid or expired token") from exc
    # Resolve the repo here, directly, rather than via `Depends(get_user_repo)`: FastAPI runs
    # sync dependency callables in a worker thread with no event loop visible, so a repo built
    # that way could be holding a `firestore.AsyncClient` bound to a stale loop (see
    # get_firestore_client's docstring). This function body runs directly on the real request
    # loop, so resolving the client here lets get_firestore_client's staleness check do its job
    # before the first real RPC. get_user_repo/get_audit_repo remain available unchanged for
    # any other route that wants them via Depends().
    client = get_firestore_client()
    audit: AuditRepo = FirestoreAuditRepo(client)
    users: UserRepo = FirestoreUserRepo(client, audit)
    return await users.get_or_bootstrap(
        uid=decoded["uid"], email=decoded.get("email"), name=decoded.get("name")
    )


def require(min_role: str) -> Callable[[User], Awaitable[User]]:
    async def guard(user: User = Depends(current_user)) -> User:
        if ROLE_LEVEL[user.role] < ROLE_LEVEL[min_role]:
            raise HTTPException(403, f"Requires {min_role} role")
        return user

    return guard
