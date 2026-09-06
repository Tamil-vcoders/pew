# api/tests/integration/test_datasets.py
from fastapi.testclient import TestClient

from app.main import app
from app.ports.repos import DATASET_CASE_CAP
from tests.integration.conftest import auth_headers, create_emulator_user, seed_model_registry

client = TestClient(app)


def _bootstrap(email: str) -> dict[str, str]:
    user = create_emulator_user(email)
    client.get("/me", headers=auth_headers(user["id_token"]))
    return user


def _make_project_and_prompt(admin_token: str) -> tuple[str, str]:
    project_id = client.post(
        "/projects", json={"name": "Support automation"}, headers=auth_headers(admin_token)
    ).json()["id"]
    prompt_id = client.post(
        f"/projects/{project_id}/prompts", json={"name": "Ticket triage", "tags": []},
        headers=auth_headers(admin_token),
    ).json()["id"]
    return project_id, prompt_id


def test_contributor_can_create_list_update_and_delete_a_case():
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
    base = f"/projects/{project_id}/prompts/{prompt_id}/dataset"
    headers = auth_headers(admin["id_token"])

    created = client.post(base, json={"input": "ticket text", "expected": "high"}, headers=headers)
    assert created.status_code == 201
    case = created.json()
    assert case["order"] == 0
    assert case["source"] == "manual"

    listed = client.get(base, headers=headers).json()
    assert [c["id"] for c in listed] == [case["id"]]

    updated = client.patch(f"{base}/{case['id']}", json={"expected": "critical"}, headers=headers)
    assert updated.json()["expected"] == "critical"
    assert updated.json()["input"] == "ticket text"  # untouched field preserved

    deleted = client.delete(f"{base}/{case['id']}", headers=headers)
    assert deleted.status_code == 204
    assert client.get(base, headers=headers).json() == []


def test_dataset_case_creation_is_refused_past_the_30_case_cap():
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
    base = f"/projects/{project_id}/prompts/{prompt_id}/dataset"
    headers = auth_headers(admin["id_token"])

    for i in range(DATASET_CASE_CAP):
        resp = client.post(base, json={"input": f"case {i}", "expected": "x"}, headers=headers)
        assert resp.status_code == 201

    over_cap = client.post(base, json={"input": "one too many", "expected": "x"}, headers=headers)
    assert over_cap.status_code == 409


def test_viewer_gets_403_reading_the_dataset():
    """Datasets are private per prompt — Appendix A requires contributor even to read."""
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
    viewer = _bootstrap("dev@acme.dev")

    resp = client.get(
        f"/projects/{project_id}/prompts/{prompt_id}/dataset", headers=auth_headers(viewer["id_token"])
    )
    assert resp.status_code == 403


async def test_generate_creates_cases_marked_generated_and_reports_a_positive_cost():
    await seed_model_registry()
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])

    resp = client.post(
        f"/projects/{project_id}/prompts/{prompt_id}/dataset/generate",
        json={"text": "Summarize the ticket: {{ticket_text}}", "n": 3},
        headers=auth_headers(admin["id_token"]),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["cases"]) == 3
    assert all(c["source"] == "generated" for c in body["cases"])
    assert body["cost"] > 0
    assert body["model"] == "gemini-3.6-flash"
