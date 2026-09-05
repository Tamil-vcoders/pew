# api/tests/integration/test_projects.py
from fastapi.testclient import TestClient

from app.main import app
from tests.integration.conftest import auth_headers, create_emulator_user, set_user_role

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


async def test_genuine_maintainer_can_create_a_project() -> None:
    """`POST /projects` requires "maintainer". Every other test above only ever proves this
    with the bootstrapped-first administrator (level 3) — that would still pass even if the
    route accidentally required "contributor" (level 1) or "administrator" (level 3) instead
    of "maintainer" (level 2). This mints a real maintainer-role token (via the same
    get_or_bootstrap-then-set-role path the seed script now uses) to prove the actual
    threshold."""
    _bootstrap("asha@acme.dev")  # first user, becomes administrator, unused here
    maintainer = _bootstrap("vikram@acme.dev")  # second user -> viewer by default
    await set_user_role(maintainer["uid"], "maintainer")

    resp = client.post(
        "/projects", json={"name": "Support automation"}, headers=auth_headers(maintainer["id_token"])
    )
    assert resp.status_code == 201


async def test_genuine_contributor_gets_403_creating_a_project() -> None:
    """The denied side of the same boundary: a genuine contributor (level 1, one below
    "maintainer") must be refused, proving the gate isn't accidentally set to "contributor"."""
    _bootstrap("asha@acme.dev")
    contributor = _bootstrap("meera@acme.dev")
    await set_user_role(contributor["uid"], "contributor")

    resp = client.post(
        "/projects", json={"name": "Marketing copy"}, headers=auth_headers(contributor["id_token"])
    )
    assert resp.status_code == 403
