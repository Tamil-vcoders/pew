# api/tests/integration/test_admin.py
"""Emulator-backed integration tests for the Phase 5 admin API surface (routes/admin.py,
services/admin.py, self-service /me) — role gates, the AC-11.4 last-administrator guard, the
audit trail, and account deletion glued to real Firestore + Auth emulators.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.deps import get_firestore_client
from app.main import app
from tests.integration.conftest import (
    auth_headers,
    create_emulator_user,
    seed_model_registry,
    set_user_role,
)

client = TestClient(app)


def _bootstrap(email: str) -> dict[str, str]:
    user = create_emulator_user(email)
    client.get("/me", headers=auth_headers(user["id_token"]))
    return user


async def _audit_entries() -> list[dict[str, object]]:
    fs = await get_firestore_client()
    return [d.to_dict() for d in [doc async for doc in fs.collection("auditLogs").order_by("ts").stream()]]


def test_administrator_can_change_a_members_role_and_it_is_audited() -> None:
    admin = _bootstrap("asha@acme.dev")
    member = _bootstrap("dev@acme.dev")  # second user -> viewer by default

    resp = client.put(
        f"/admin/members/{member['uid']}/role",
        json={"role": "contributor"},
        headers=auth_headers(admin["id_token"]),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["role"] == "contributor"

    listed = client.get("/admin/members", headers=auth_headers(admin["id_token"]))
    assert listed.status_code == 200
    roles = {u["uid"]: u["role"] for u in listed.json()}
    assert roles[member["uid"]] == "contributor"

    audit_resp = client.get("/admin/audit", headers=auth_headers(admin["id_token"]))
    assert audit_resp.status_code == 200
    role_change = [e for e in audit_resp.json() if e["action"] == "role-change"]
    assert len(role_change) == 1
    assert role_change[0]["subject"] == member["uid"]
    assert role_change[0]["before"] == {"role": "viewer"}
    assert role_change[0]["after"] == {"role": "contributor"}


async def test_non_administrator_cannot_change_roles() -> None:
    _bootstrap("asha@acme.dev")
    contributor = _bootstrap("meera@acme.dev")
    await set_user_role(contributor["uid"], "contributor")
    other = _bootstrap("dev@acme.dev")

    resp = client.put(
        f"/admin/members/{other['uid']}/role",
        json={"role": "maintainer"},
        headers=auth_headers(contributor["id_token"]),
    )
    assert resp.status_code == 403


def test_demoting_the_last_administrator_is_rejected() -> None:
    admin = _bootstrap("asha@acme.dev")  # sole administrator

    resp = client.put(
        f"/admin/members/{admin['uid']}/role",
        json={"role": "viewer"},
        headers=auth_headers(admin["id_token"]),
    )
    assert resp.status_code == 409

    # Unaffected: still administrator afterwards.
    me = client.get("/me", headers=auth_headers(admin["id_token"]))
    assert me.json()["role"] == "administrator"


def test_demoting_one_of_two_administrators_is_allowed() -> None:
    admin = _bootstrap("asha@acme.dev")
    second = _bootstrap("vikram@acme.dev")
    promote = client.put(
        f"/admin/members/{second['uid']}/role",
        json={"role": "administrator"},
        headers=auth_headers(admin["id_token"]),
    )
    assert promote.status_code == 200

    resp = client.put(
        f"/admin/members/{second['uid']}/role",
        json={"role": "viewer"},
        headers=auth_headers(admin["id_token"]),
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "viewer"


async def test_model_registry_is_viewer_readable_and_maintainer_writable() -> None:
    await seed_model_registry()
    admin = _bootstrap("asha@acme.dev")
    viewer = _bootstrap("dev@acme.dev")

    read_as_viewer = client.get("/admin/model-registry", headers=auth_headers(viewer["id_token"]))
    assert read_as_viewer.status_code == 200
    assert "gemini-3.1-pro-preview" in read_as_viewer.json()

    denied = client.patch(
        "/admin/model-registry",
        json={"modelId": "gemini-3.1-pro-preview", "enabled": False},
        headers=auth_headers(viewer["id_token"]),
    )
    assert denied.status_code == 403

    patched = client.patch(
        "/admin/model-registry",
        json={"modelId": "gemini-3.1-pro-preview", "enabled": False, "rateInPer1M": 3.5},
        headers=auth_headers(admin["id_token"]),
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["enabled"] is False
    assert patched.json()["rateInPer1M"] == 3.5


def test_privacy_read_is_viewer_and_write_is_administrator_only() -> None:
    admin = _bootstrap("asha@acme.dev")
    viewer = _bootstrap("dev@acme.dev")

    got = client.get("/admin/privacy", headers=auth_headers(viewer["id_token"]))
    assert got.status_code == 200
    assert "retentionDays" in got.json()

    denied = client.patch(
        "/admin/privacy", json={"retentionDays": 30, "telemetry": False}, headers=auth_headers(viewer["id_token"])
    )
    assert denied.status_code == 403

    updated = client.patch(
        "/admin/privacy", json={"retentionDays": 30, "telemetry": False}, headers=auth_headers(admin["id_token"])
    )
    assert updated.status_code == 200
    assert updated.json() == {"retentionDays": 30, "telemetry": False}


def test_self_service_name_patch_persists() -> None:
    user = _bootstrap("asha@acme.dev")
    resp = client.patch("/me", json={"name": "Asha R."}, headers=auth_headers(user["id_token"]))
    assert resp.status_code == 200
    assert resp.json()["name"] == "Asha R."

    again = client.get("/me", headers=auth_headers(user["id_token"]))
    assert again.json()["name"] == "Asha R."


async def test_self_service_delete_anonymizes_and_audits() -> None:
    user = _bootstrap("asha@acme.dev")

    resp = client.delete("/me", headers=auth_headers(user["id_token"]))
    assert resp.status_code == 204

    fs = await get_firestore_client()
    snap = await fs.collection("users").document(user["uid"]).get()
    assert snap.exists  # doc kept, not deleted
    data = snap.to_dict()
    assert data["name"] == "Deleted user"
    assert data["email"] == ""
    assert data["role"] == "viewer"

    entries = await _audit_entries()
    actions = [e["action"] for e in entries]
    assert "account-deleted" in actions
    deletion = next(e for e in entries if e["action"] == "account-deleted")
    assert deletion["subject"] == user["uid"]
