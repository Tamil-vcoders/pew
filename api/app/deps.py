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
from app.ports.repos import AuditRepo, ProjectRepo, PromptRepo, UserRepo

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


async def get_firestore_client() -> firestore.AsyncClient:
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

    This is declared `async def` (rather than a plain `def`) specifically so that FastAPI
    evaluates it directly on the caller's real event loop instead of routing it through
    `run_in_threadpool` (which FastAPI does for any *sync* `Depends()` callable, and which
    runs in a worker thread with no event loop visible at all — `asyncio.get_running_loop()`
    raises there, so a plain-`def` version of this function can't reliably detect a stale
    binding when reached via `Depends(get_firestore_client) -> Depends(get_audit_repo) ->
    Depends(get_user_repo) -> Depends(current_user)`). Confirmed empirically: FastAPI awaits
    `async def` dependencies directly, even nested several levels deep under other `Depends()`
    calls, so `asyncio.get_running_loop()` here always sees the real request loop. Any direct
    (non-`Depends`) caller — e.g. in tests — must now `await get_firestore_client()`.
    """
    global _firestore_client, _firestore_client_loop_id
    running_loop_id = id(asyncio.get_running_loop())
    if _firestore_client is not None and running_loop_id != _firestore_client_loop_id:
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


def get_project_repo(client: firestore.AsyncClient = Depends(get_firestore_client)) -> ProjectRepo:
    # Local import avoids a circular-import ordering concern between deps.py and
    # firestore_repos.py; keep the same pattern for get_prompt_repo in Task 5.
    from app.adapters.firestore_repos import FirestoreProjectRepo

    return FirestoreProjectRepo(client)


def get_prompt_repo(client: firestore.AsyncClient = Depends(get_firestore_client)) -> PromptRepo:
    from app.adapters.firestore_repos import FirestorePromptRepo

    return FirestorePromptRepo(client)


async def current_user(
    authorization: str | None = Header(default=None),
    users: UserRepo = Depends(get_user_repo),
) -> User:
    get_firebase_app()
    if authorization is None or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    try:
        decoded = fb_auth.verify_id_token(authorization.removeprefix("Bearer "))
    except Exception as exc:
        raise HTTPException(401, "Invalid or expired token") from exc
    return await users.get_or_bootstrap(
        uid=decoded["uid"], email=decoded.get("email"), name=decoded.get("name")
    )


def require(min_role: str) -> Callable[[User], Awaitable[User]]:
    async def guard(user: User = Depends(current_user)) -> User:
        if ROLE_LEVEL.get(user.role, -1) < ROLE_LEVEL[min_role]:
            raise HTTPException(403, f"Requires {min_role} role")
        return user

    return guard
