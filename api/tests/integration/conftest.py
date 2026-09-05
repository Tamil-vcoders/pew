# api/tests/integration/conftest.py
from __future__ import annotations

import os
from collections.abc import Iterator
from typing import Any

import httpx
import pytest

os.environ.setdefault("FIRESTORE_EMULATOR_HOST", "localhost:8080")
os.environ.setdefault("FIREBASE_AUTH_EMULATOR_HOST", "localhost:9099")
os.environ.setdefault("FIREBASE_PROJECT_ID", "demo-pew-test")

PROJECT_ID = os.environ["FIREBASE_PROJECT_ID"]
AUTH_EMULATOR = f"http://{os.environ['FIREBASE_AUTH_EMULATOR_HOST']}"
FIRESTORE_EMULATOR = f"http://{os.environ['FIRESTORE_EMULATOR_HOST']}"


@pytest.fixture(autouse=True)
def _clear_emulators() -> Iterator[None]:
    """Wipe Auth + Firestore emulator state before every test so tests don't leak into each other."""
    httpx.delete(f"{AUTH_EMULATOR}/emulator/v1/projects/{PROJECT_ID}/accounts", timeout=10)
    httpx.delete(
        f"{FIRESTORE_EMULATOR}/emulator/v1/projects/{PROJECT_ID}/databases/(default)/documents",
        timeout=10,
    )
    yield


def create_emulator_user(email: str, password: str = "correct horse battery staple") -> dict[str, Any]:
    """Sign up a user against the Auth emulator's REST API and return {uid, id_token}."""
    resp = httpx.post(
        f"{AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp",
        params={"key": "fake-api-key"},
        json={"email": email, "password": password, "returnSecureToken": True},
        timeout=10,
    )
    resp.raise_for_status()
    body = resp.json()
    return {"uid": body["localId"], "id_token": body["idToken"], "email": email}


def auth_headers(id_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {id_token}"}


async def set_user_role(uid: str, role: str) -> None:
    """Directly set an already-bootstrapped user's Firestore role, bypassing the
    role-promotion endpoint that doesn't exist yet (Phase 5). Phase 1's bootstrap logic can
    only ever mint one administrator (the first sign-in) and viewers (every sign-in after
    that), so this is the only way tests can exercise a genuine contributor/maintainer token
    against the RBAC boundaries in between — mirrors exactly what the seed script now does
    for the vikram/meera demo accounts (get_or_bootstrap, then a direct role update)."""
    from app.deps import get_firestore_client

    fs = await get_firestore_client()
    await fs.collection("users").document(uid).update({"role": role})
