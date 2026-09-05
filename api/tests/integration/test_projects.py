# api/tests/integration/test_projects.py
from fastapi.testclient import TestClient

from app.main import app
from tests.integration.conftest import auth_headers, create_emulator_user

client = TestClient(app)


def _bootstrap(email: str) -> dict[str, str]:
    user = create_emulator_user(email)
    client.get("/me", headers=auth_headers(user["id_token"]))
    return user


def test_administrator_can_create_and_list_projects() -> None:
    admin = _bootstrap("asha@acme.dev")  # first user -> administrator
    resp = client.post("/projects", json={"name": "Support automation"}, headers=auth_headers(admin["id_token"]))
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Support automation"
    assert body["cfg"]["models"]["execution"] == "gemini-2.5-pro"

    listed = client.get("/projects", headers=auth_headers(admin["id_token"]))
    assert listed.status_code == 200
    assert [p["name"] for p in listed.json()] == ["Support automation"]


def test_viewer_cannot_create_a_project() -> None:
    _bootstrap("asha@acme.dev")  # first user, becomes administrator, unused here
    viewer = _bootstrap("dev@acme.dev")  # second user -> viewer
    resp = client.post("/projects", json={"name": "Marketing copy"}, headers=auth_headers(viewer["id_token"]))
    assert resp.status_code == 403


def test_viewer_can_list_projects() -> None:
    admin = _bootstrap("asha@acme.dev")
    client.post("/projects", json={"name": "Support automation"}, headers=auth_headers(admin["id_token"]))
    viewer = _bootstrap("dev@acme.dev")
    resp = client.get("/projects", headers=auth_headers(viewer["id_token"]))
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_maintainer_can_rename_a_project() -> None:
    admin = _bootstrap("asha@acme.dev")
    created = client.post(
        "/projects", json={"name": "Support automation"}, headers=auth_headers(admin["id_token"])
    ).json()
    resp = client.patch(
        f"/projects/{created['id']}", json={"name": "Support triage"}, headers=auth_headers(admin["id_token"])
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Support triage"


def test_renaming_a_missing_project_is_404() -> None:
    admin = _bootstrap("asha@acme.dev")
    resp = client.patch(
        "/projects/does-not-exist", json={"name": "x"}, headers=auth_headers(admin["id_token"])
    )
    assert resp.status_code == 404
