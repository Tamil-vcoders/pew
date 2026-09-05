# api/tests/integration/test_prompts.py
from fastapi.testclient import TestClient

from app.main import app
from tests.integration.conftest import auth_headers, create_emulator_user, set_user_role

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


def test_administrator_can_rename_a_prompt_and_viewer_cannot_archive() -> None:
    """NOTE: despite what an earlier version of this test's name/comment claimed, neither
    case here exercises a genuine contributor token — "contributor" below is the
    bootstrapped-second-user *viewer*, not a real contributor (Phase 1 has no
    role-promotion endpoint, so the only way to mint one is a direct Firestore role update,
    which is what test_genuine_contributor_can_create_and_rename_but_not_archive_a_prompt
    below now does). This test only proves: an administrator (>= contributor) may rename, and a
    viewer (< contributor) may not archive. See that test for the actual contributor/
    maintainer boundary."""
    admin = _bootstrap("asha@acme.dev")
    project_id = _make_project(admin["id_token"])
    prompt = client.post(
        f"/projects/{project_id}/prompts", json={"name": "Draft", "tags": []},
        headers=auth_headers(admin["id_token"]),
    ).json()

    viewer = _bootstrap("dev@acme.dev")

    ok = client.patch(
        f"/projects/{project_id}/prompts/{prompt['id']}", json={"name": "Renamed"},
        headers=auth_headers(admin["id_token"]),
    )
    assert ok.status_code == 200
    assert ok.json()["name"] == "Renamed"

    denied = client.patch(
        f"/projects/{project_id}/prompts/{prompt['id']}", json={"archived": True},
        headers=auth_headers(viewer["id_token"]),
    )
    assert denied.status_code == 403


async def test_genuine_contributor_can_create_and_rename_but_not_archive_a_prompt() -> None:
    """The real contributor/maintainer boundary, exercised with a genuine contributor-role
    token (level 1) minted via get_or_bootstrap + a direct Firestore role update — mirroring
    what the seed script now does for meera. Proves `POST .../prompts` and the rename path
    are gated at "contributor" (not e.g. "maintainer", which the bootstrapped-admin-only
    tests above wouldn't catch), and that archiving still requires "maintainer"."""
    admin = _bootstrap("asha@acme.dev")
    project_id = _make_project(admin["id_token"])
    contributor = _bootstrap("meera@acme.dev")
    await set_user_role(contributor["uid"], "contributor")

    created = client.post(
        f"/projects/{project_id}/prompts", json={"name": "Draft", "tags": []},
        headers=auth_headers(contributor["id_token"]),
    )
    assert created.status_code == 201
    prompt = created.json()

    renamed = client.patch(
        f"/projects/{project_id}/prompts/{prompt['id']}", json={"name": "Renamed"},
        headers=auth_headers(contributor["id_token"]),
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Renamed"

    denied = client.patch(
        f"/projects/{project_id}/prompts/{prompt['id']}", json={"archived": True},
        headers=auth_headers(contributor["id_token"]),
    )
    assert denied.status_code == 403


async def test_genuine_maintainer_can_archive_a_prompt() -> None:
    """The allowed side of the archive boundary with a genuine maintainer-role token (level
    2), not the bootstrapped administrator (level 3) every other archive test above uses —
    proving the gate isn't accidentally set to "administrator"."""
    admin = _bootstrap("asha@acme.dev")
    project_id = _make_project(admin["id_token"])
    maintainer = _bootstrap("vikram@acme.dev")
    await set_user_role(maintainer["uid"], "maintainer")

    prompt = client.post(
        f"/projects/{project_id}/prompts", json={"name": "Draft", "tags": []},
        headers=auth_headers(admin["id_token"]),
    ).json()

    archived = client.patch(
        f"/projects/{project_id}/prompts/{prompt['id']}", json={"archived": True},
        headers=auth_headers(maintainer["id_token"]),
    )
    assert archived.status_code == 200
    assert archived.json()["archived"] is True


def test_viewer_gets_403_renaming_a_prompt() -> None:
    """The rename/tag path is contributor-gated too — a viewer's token must be denied here,
    not just on the archive path (test_administrator_can_rename_a_prompt_and_viewer_cannot_archive
    above only exercises the "allowed" rename case and the "denied" archive case; this covers the
    "denied" rename case the same boundary requires)."""
    admin = _bootstrap("asha@acme.dev")
    project_id = _make_project(admin["id_token"])
    prompt = client.post(
        f"/projects/{project_id}/prompts", json={"name": "Draft", "tags": []},
        headers=auth_headers(admin["id_token"]),
    ).json()

    viewer = _bootstrap("dev@acme.dev")
    resp = client.patch(
        f"/projects/{project_id}/prompts/{prompt['id']}", json={"name": "Renamed"},
        headers=auth_headers(viewer["id_token"]),
    )
    assert resp.status_code == 403


def test_patching_a_missing_prompt_is_404() -> None:
    admin = _bootstrap("asha@acme.dev")
    project_id = _make_project(admin["id_token"])
    resp = client.patch(
        f"/projects/{project_id}/prompts/does-not-exist", json={"name": "x"},
        headers=auth_headers(admin["id_token"]),
    )
    assert resp.status_code == 404


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
