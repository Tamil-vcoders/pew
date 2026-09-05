# api/tests/test_deps.py
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.deps import get_user_repo
from app.domain.models import User
from app.main import app

client = TestClient(app)


class _FakeUserRepo:
    """A UserRepo stand-in that never touches Firestore, used to prove `current_user`
    resolves its repo via `Depends(get_user_repo)` rather than constructing one inline."""

    async def get(self, uid: str) -> User | None:
        return None

    async def get_or_bootstrap(self, uid: str, email: str | None, name: str | None) -> User:
        return User(
            uid="fake-uid",
            email="fake@test.dev",
            name="Fake",
            role="maintainer",
            created_at=datetime.now(UTC),
        )


def test_current_user_is_wired_through_get_user_repo_dependency(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Regression guard: `current_user` must resolve `users` via `Depends(get_user_repo)`,
    # not by hand-constructing FirestoreAuditRepo/FirestoreUserRepo inline (an earlier draft
    # of the event-loop fix in app/deps.py did exactly that, which silently made
    # get_user_repo/get_audit_repo dead code and broke this exact override mechanism). If
    # current_user ever goes back to inline construction, this override has no effect,
    # get_or_bootstrap would try to hit the real (unconfigured, in this unit-test process)
    # Firestore client instead, and the assertions below fail.
    #
    # No Firestore/Firebase emulator involved: `verify_id_token` is stubbed directly (this is
    # a pure unit test of the dependency wiring, not of token verification or bootstrap logic
    # — those are covered by the emulator-backed tests in tests/integration/test_auth_bootstrap.py),
    # and overriding get_user_repo means FirestoreUserRepo/FirestoreAuditRepo are never invoked.
    monkeypatch.setattr(
        "app.deps.fb_auth.verify_id_token",
        lambda token: {"uid": "whatever", "email": "e@test.dev", "name": "N"},
    )
    app.dependency_overrides[get_user_repo] = lambda: _FakeUserRepo()
    try:
        resp = client.get(
            "/me",
            headers={"Authorization": "Bearer whatever-since-verify-id-token-is-stubbed"},
        )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    body = resp.json()
    assert body["uid"] == "fake-uid"
    assert body["role"] == "maintainer"
