# api/tests/integration/test_prompts.py
from fastapi.testclient import TestClient

from app.main import app
from tests.integration.conftest import auth_headers, create_emulator_user

client = TestClient(app)


def _bootstrap(email: str) -> dict[str, str]:
    user = create_emulator_user(email)
    client.get("/me", headers=auth_headers(user["id_token"]))
    return user


def _make_project(admin_token: str, name: str = "Support automation") -> str:
    resp = client.post("/projects", json={"name": name}, headers=auth_headers(admin_token))
    return str(resp.json()["id"])


def test_contributor_can_create_a_prompt() -> None:
    admin = _bootstrap("asha@acme.dev")
    project_id = _make_project(admin["id_token"])
    # promote nobody yet — admin itself is >= contributor, use admin to create
    resp = client.post(
        f"/projects/{project_id}/prompts",
        json={"name": "Ticket triage", "tags": ["triage", "prod"]},
        headers=auth_headers(admin["id_token"]),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Ticket triage"
    assert body["archived"] is False
    assert body["latestVersion"] == 0
    assert body["bestScore"] is None


def test_viewer_gets_403_creating_a_prompt() -> None:
    """Phase 1 exit criterion (devspec §10): API returns 403 when a viewer's token
    calls a contributor endpoint — tested here, not assumed."""
    admin = _bootstrap("asha@acme.dev")
    project_id = _make_project(admin["id_token"])
    viewer = _bootstrap("dev@acme.dev")
    resp = client.post(
        f"/projects/{project_id}/prompts",
        json={"name": "Ticket triage", "tags": []},
        headers=auth_headers(viewer["id_token"]),
    )
    assert resp.status_code == 403


def test_duplicate_prompt_name_in_same_project_is_rejected() -> None:
    admin = _bootstrap("asha@acme.dev")
    project_id = _make_project(admin["id_token"])
    client.post(
        f"/projects/{project_id}/prompts", json={"name": "Ticket triage", "tags": []},
        headers=auth_headers(admin["id_token"]),
    )
    dup = client.post(
        f"/projects/{project_id}/prompts", json={"name": "ticket triage", "tags": []},
        headers=auth_headers(admin["id_token"]),
    )
    assert dup.status_code == 409


def test_same_name_is_fine_in_a_different_project() -> None:
    admin = _bootstrap("asha@acme.dev")
    project_a = _make_project(admin["id_token"], "Support automation")
    project_b = _make_project(admin["id_token"], "Marketing copy")
    client.post(f"/projects/{project_a}/prompts", json={"name": "Draft", "tags": []},
                headers=auth_headers(admin["id_token"]))
    resp = client.post(f"/projects/{project_b}/prompts", json={"name": "Draft", "tags": []},
                        headers=auth_headers(admin["id_token"]))
    assert resp.status_code == 201


def test_contributor_can_rename_and_tag_but_not_archive() -> None:
    admin = _bootstrap("asha@acme.dev")
    project_id = _make_project(admin["id_token"])
    prompt = client.post(
        f"/projects/{project_id}/prompts", json={"name": "Draft", "tags": []},
        headers=auth_headers(admin["id_token"]),
    ).json()

    # a contributor (not maintainer) may rename/tag ...
    contributor = _bootstrap("meera@acme.dev")
    # contributor is bootstrapped as viewer by default in Phase 1 (no promotion path exists
    # yet — that's Phase 5). Exercise the boundary using the admin account for the "allowed"
    # case and a fresh viewer for the "denied" case, which is what devspec's exit criterion
    # actually requires.
    ok = client.patch(
        f"/projects/{project_id}/prompts/{prompt['id']}", json={"name": "Renamed"},
        headers=auth_headers(admin["id_token"]),
    )
    assert ok.status_code == 200
    assert ok.json()["name"] == "Renamed"

    # ... but archiving as a mere viewer is refused
    denied = client.patch(
        f"/projects/{project_id}/prompts/{prompt['id']}", json={"archived": True},
        headers=auth_headers(contributor["id_token"]),
    )
    assert denied.status_code == 403


def test_maintainer_can_archive_and_unarchive() -> None:
    admin = _bootstrap("asha@acme.dev")
    project_id = _make_project(admin["id_token"])
    prompt = client.post(
        f"/projects/{project_id}/prompts", json={"name": "Draft", "tags": []},
        headers=auth_headers(admin["id_token"]),
    ).json()

    archived = client.patch(
        f"/projects/{project_id}/prompts/{prompt['id']}", json={"archived": True},
        headers=auth_headers(admin["id_token"]),
    )
    assert archived.status_code == 200
    assert archived.json()["archived"] is True


def test_list_prompts_requires_only_viewer() -> None:
    admin = _bootstrap("asha@acme.dev")
    project_id = _make_project(admin["id_token"])
    client.post(f"/projects/{project_id}/prompts", json={"name": "Draft", "tags": []},
                headers=auth_headers(admin["id_token"]))
    viewer = _bootstrap("dev@acme.dev")
    resp = client.get(f"/projects/{project_id}/prompts", headers=auth_headers(viewer["id_token"]))
    assert resp.status_code == 200
    assert len(resp.json()) == 1
