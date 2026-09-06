# api/tests/test_internal_oidc.py
"""Unit tests for app.deps.verify_internal_oidc (the POST /internal/iterations gate) —
TestClient + monkeypatch on app.deps.id_token.verify_oauth2_token, mirroring test_deps.py's
approach of stubbing the verification call directly rather than needing a real token.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.adapters.fake_llm import FakeLLMProvider
from app.deps import get_cycle_repo, get_firestore_client, get_llm_provider
from app.main import app

client = TestClient(app)

_VALID_SA = "tasks-invoker@pew-ideathon.iam.gserviceaccount.com"
_API_URL = "https://pew-api-abc123.a.run.app"


class _NullCycleRepo:
    """`get()` returns None so run_iteration_task no-ops immediately, without touching
    Firestore at all — the OIDC gate is what's under test here, not the idempotency logic
    (covered by tests/test_internal_iterations.py)."""

    async def get_active(self) -> None:
        return None

    async def get(self, cycle_id: str) -> None:
        return None

    async def create(self, cycle: object) -> None:
        raise NotImplementedError

    async def save(self, cycle: object, *, new_log_messages: object = ()) -> None:
        raise NotImplementedError


@pytest.fixture(autouse=True)
def _wire_fakes(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "api_public_url", _API_URL)
    monkeypatch.setattr(settings, "internal_invoker_sa", _VALID_SA)
    app.dependency_overrides[get_cycle_repo] = lambda: _NullCycleRepo()
    # No Firestore emulator here (this is a plain unit test) — the other CycleDeps repos
    # (prompts/versions/dataset/runs/registry) never get touched for a None-cycle no-op, but
    # `_deps()` still *constructs* them, and building a real firestore.AsyncClient without an
    # emulator eagerly resolves Application Default Credentials and raises. Stub the client
    # itself (never actually used) rather than every individual get_*_repo.
    app.dependency_overrides[get_firestore_client] = lambda: object()
    app.dependency_overrides[get_llm_provider] = lambda: FakeLLMProvider()
    yield
    app.dependency_overrides.clear()


def _post(headers: dict[str, str] | None = None) -> object:
    return client.post(
        "/internal/iterations", json={"cycleId": "cycle-1", "iteration": 1}, headers=headers or {}
    )


def test_valid_invoker_token_is_accepted(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.deps.id_token.verify_oauth2_token",
        lambda token, request, audience: {"email": _VALID_SA, "email_verified": True},
    )
    resp = _post(headers={"Authorization": "Bearer whatever-since-verify-is-stubbed"})
    assert resp.status_code == 200  # type: ignore[attr-defined]


def test_wrong_audience_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    def _raise(token: str, request: object, audience: str) -> None:
        raise ValueError("Wrong recipient, payload audience != requested audience")

    monkeypatch.setattr("app.deps.id_token.verify_oauth2_token", _raise)
    resp = _post(headers={"Authorization": "Bearer whatever"})
    assert resp.status_code == 403  # type: ignore[attr-defined]


def test_wrong_email_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.deps.id_token.verify_oauth2_token",
        lambda token, request, audience: {"email": "someone-else@example.com", "email_verified": True},
    )
    resp = _post(headers={"Authorization": "Bearer whatever"})
    assert resp.status_code == 403  # type: ignore[attr-defined]


def test_unverified_email_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.deps.id_token.verify_oauth2_token",
        lambda token, request, audience: {"email": _VALID_SA, "email_verified": False},
    )
    resp = _post(headers={"Authorization": "Bearer whatever"})
    assert resp.status_code == 403  # type: ignore[attr-defined]


def test_missing_bearer_header_is_rejected() -> None:
    resp = _post()
    assert resp.status_code == 403  # type: ignore[attr-defined]


def test_firebase_user_id_token_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    """A genuine Firebase user ID token fails `verify_oauth2_token` on signature/issuer
    mismatch — it's minted by a different issuer/keyset than Google's OIDC service-account
    tokens. Simulated via the same raising monkeypatch as the wrong-audience case above,
    which is realistic (that's really where a Firebase token fails this check), not just
    mock convenience."""

    def _raise(token: str, request: object, audience: str) -> None:
        raise ValueError("Wrong number of segments in token: b'not-a-google-oidc-token'.")

    monkeypatch.setattr("app.deps.id_token.verify_oauth2_token", _raise)
    resp = _post(headers={"Authorization": "Bearer a-firebase-user-id-token"})
    assert resp.status_code == 403  # type: ignore[attr-defined]
