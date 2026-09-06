# api/tests/integration/test_auth_bootstrap.py
from fastapi.testclient import TestClient

from app.main import app
from tests.integration.conftest import auth_headers, create_emulator_user

client = TestClient(app)


def test_first_user_becomes_administrator() -> None:
    asha = create_emulator_user("asha@acme.dev")
    resp = client.get("/me", headers=auth_headers(asha["id_token"]))
    assert resp.status_code == 200
    assert resp.json()["role"] == "administrator"


def test_second_distinct_user_becomes_viewer() -> None:
    asha = create_emulator_user("asha@acme.dev")
    client.get("/me", headers=auth_headers(asha["id_token"]))  # first user, becomes admin
    dev = create_emulator_user("dev@acme.dev")
    resp = client.get("/me", headers=auth_headers(dev["id_token"]))
    assert resp.status_code == 200
    assert resp.json()["role"] == "viewer"


async def test_bootstrap_writes_an_audit_log_entry_for_every_new_user() -> None:
    # Phase 5 (US-18): every new-user branch is audited now, not just the first — the
    # `action` distinguishes bootstrap-admin (first user) from an ordinary user-signup.
    from app.deps import get_firestore_client

    asha = create_emulator_user("asha@acme.dev")
    client.get("/me", headers=auth_headers(asha["id_token"]))
    dev = create_emulator_user("dev@acme.dev")
    client.get("/me", headers=auth_headers(dev["id_token"]))

    fs = await get_firestore_client()
    docs = [d async for d in fs.collection("auditLogs").order_by("ts").stream()]
    assert len(docs) == 2
    first, second = (d.to_dict() for d in docs)
    assert first["action"] == "bootstrap-admin"
    assert first["subject"] == asha["uid"]
    assert second["action"] == "user-signup"
    assert second["subject"] == dev["uid"]


def test_missing_bearer_token_is_rejected() -> None:
    # `current_user` declares `authorization` as an *optional* header (`Header(default=None)`)
    # specifically so a header-less request reaches current_user's own body and gets a clean
    # 401 "Missing bearer token" here, rather than FastAPI's own request validation rejecting
    # it with a 422 that leaks the parameter name in a raw Pydantic validation error body. A
    # present-but-malformed header hits the same 401 branch, covered by
    # test_malformed_bearer_token_is_rejected below.
    resp = client.get("/me")
    assert resp.status_code == 401


def test_malformed_bearer_token_is_rejected() -> None:
    resp = client.get("/me", headers={"Authorization": "not-a-bearer-token"})
    assert resp.status_code == 401


def test_same_user_signing_in_twice_keeps_their_role() -> None:
    asha = create_emulator_user("asha@acme.dev")
    first = client.get("/me", headers=auth_headers(asha["id_token"]))
    second = client.get("/me", headers=auth_headers(asha["id_token"]))
    assert first.json()["role"] == second.json()["role"] == "administrator"
