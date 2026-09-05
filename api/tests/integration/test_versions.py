# api/tests/integration/test_versions.py
from fastapi.testclient import TestClient

from app.main import app
from tests.integration.conftest import auth_headers, create_emulator_user, set_user_role

client = TestClient(app)


def _bootstrap(email: str) -> dict[str, str]:
    user = create_emulator_user(email)
    client.get("/me", headers=auth_headers(user["id_token"]))
    return user


def _make_project(admin_token: str) -> str:
    resp = client.post("/projects", json={"name": "Support automation"}, headers=auth_headers(admin_token))
    return str(resp.json()["id"])


def _make_prompt(admin_token: str, project_id: str) -> str:
    resp = client.post(
        f"/projects/{project_id}/prompts", json={"name": "Ticket triage", "tags": []},
        headers=auth_headers(admin_token),
    )
    return str(resp.json()["id"])


def test_contributor_can_create_a_version_and_the_prompts_latest_version_advances():
    admin = _bootstrap("asha@acme.dev")
    project_id = _make_project(admin["id_token"])
    prompt_id = _make_prompt(admin["id_token"], project_id)

    resp = client.post(
        f"/projects/{project_id}/prompts/{prompt_id}/versions",
        json={"text": "Summarize the ticket.", "note": "Initial draft", "technique": None},
        headers=auth_headers(admin["id_token"]),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["n"] == 1
    assert body["text"] == "Summarize the ticket."
    assert body["createdBy"] == admin["uid"]
    assert body["createdAt"] is not None

    prompt = client.get(
        f"/projects/{project_id}/prompts", headers=auth_headers(admin["id_token"])
    ).json()[0]
    assert prompt["latestVersion"] == 1


def test_versions_increment_and_carry_a_technique_when_applying_a_suggestion():
    admin = _bootstrap("asha@acme.dev")
    project_id = _make_project(admin["id_token"])
    prompt_id = _make_prompt(admin["id_token"], project_id)
    client.post(
        f"/projects/{project_id}/prompts/{prompt_id}/versions",
        json={"text": "v1 text", "note": "Initial draft", "technique": None},
        headers=auth_headers(admin["id_token"]),
    )
    resp = client.post(
        f"/projects/{project_id}/prompts/{prompt_id}/versions",
        json={"text": "v2 text", "note": "Applied: Clear and direct", "technique": "Clear and direct"},
        headers=auth_headers(admin["id_token"]),
    )
    body = resp.json()
    assert body["n"] == 2
    assert body["technique"] == "Clear and direct"


def test_viewer_gets_403_creating_a_version():
    admin = _bootstrap("asha@acme.dev")
    project_id = _make_project(admin["id_token"])
    prompt_id = _make_prompt(admin["id_token"], project_id)
    viewer = _bootstrap("dev@acme.dev")
    resp = client.post(
        f"/projects/{project_id}/prompts/{prompt_id}/versions",
        json={"text": "x", "note": None, "technique": None},
        headers=auth_headers(viewer["id_token"]),
    )
    assert resp.status_code == 403


async def test_genuine_contributor_can_create_a_version():
    """The real contributor boundary, not just the bootstrapped administrator."""
    admin = _bootstrap("asha@acme.dev")
    project_id = _make_project(admin["id_token"])
    prompt_id = _make_prompt(admin["id_token"], project_id)
    contributor = _bootstrap("meera@acme.dev")
    await set_user_role(contributor["uid"], "contributor")

    resp = client.post(
        f"/projects/{project_id}/prompts/{prompt_id}/versions",
        json={"text": "x", "note": None, "technique": None},
        headers=auth_headers(contributor["id_token"]),
    )
    assert resp.status_code == 201


def test_creating_a_version_for_a_missing_prompt_is_404():
    admin = _bootstrap("asha@acme.dev")
    project_id = _make_project(admin["id_token"])
    resp = client.post(
        f"/projects/{project_id}/prompts/does-not-exist/versions",
        json={"text": "x", "note": None, "technique": None},
        headers=auth_headers(admin["id_token"]),
    )
    assert resp.status_code == 404


def test_no_update_or_delete_route_exists_for_versions():
    """Versions are append-only (CLAUDE.md): confirm no PATCH/DELETE route is wired."""
    admin = _bootstrap("asha@acme.dev")
    project_id = _make_project(admin["id_token"])
    prompt_id = _make_prompt(admin["id_token"], project_id)
    base = f"/projects/{project_id}/prompts/{prompt_id}/versions"

    patched = client.patch(base, json={"text": "x"}, headers=auth_headers(admin["id_token"]))
    assert patched.status_code == 405
    deleted = client.delete(base, headers=auth_headers(admin["id_token"]))
    assert deleted.status_code == 405
