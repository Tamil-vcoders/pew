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


async def test_bootstrap_writes_an_audit_log_entry_for_the_first_admin_only() -> None:
    from app.deps import get_firestore_client

    asha = create_emulator_user("asha@acme.dev")
    client.get("/me", headers=auth_headers(asha["id_token"]))
    dev = create_emulator_user("dev@acme.dev")
    client.get("/me", headers=auth_headers(dev["id_token"]))

    fs = get_firestore_client()
    docs = [d async for d in fs.collection("auditLogs").stream()]
    assert len(docs) == 1
    entry = docs[0].to_dict()
    assert entry["action"] == "bootstrap-admin"
    assert entry["subject"] == asha["uid"]


def test_missing_bearer_token_is_rejected() -> None:
    # No Authorization header at all fails FastAPI's own request validation (422) before
    # current_user's body ever runs; a present-but-malformed header is what reaches the
    # 401 branch, covered by test_malformed_bearer_token_is_rejected below.
    resp = client.get("/me")
    assert resp.status_code == 422


def test_malformed_bearer_token_is_rejected() -> None:
    resp = client.get("/me", headers={"Authorization": "not-a-bearer-token"})
    assert resp.status_code == 401


def test_same_user_signing_in_twice_keeps_their_role() -> None:
    asha = create_emulator_user("asha@acme.dev")
    first = client.get("/me", headers=auth_headers(asha["id_token"]))
    second = client.get("/me", headers=auth_headers(asha["id_token"]))
    assert first.json()["role"] == second.json()["role"] == "administrator"
