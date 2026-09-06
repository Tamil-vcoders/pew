# api/tests/integration/test_runs.py
from fastapi.testclient import TestClient

from app.deps import get_firestore_client
from app.domain.models import CaseResult
from app.domain.scoring import blend_run
from app.main import app
from tests.integration.conftest import auth_headers, create_emulator_user, seed_model_registry

client = TestClient(app)

EQUAL_WEIGHTS = {"code": 1.0, "model": 1.0, "human": 1.0}


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


def _add_cases(project_id: str, prompt_id: str, token: str, n: int) -> None:
    for i in range(n):
        resp = client.post(
            f"/projects/{project_id}/prompts/{prompt_id}/dataset",
            json={"input": f"ticket {i}", "expected": "high"}, headers=auth_headers(token),
        )
        assert resp.status_code == 201


async def _case_docs(project_id: str, prompt_id: str, run_id: str) -> list[dict[str, object]]:
    fs = await get_firestore_client()
    base = (
        fs.collection("projects").document(project_id).collection("prompts").document(prompt_id)
        .collection("runs").document(run_id).collection("cases")
    )
    return [d.to_dict() async for d in base.order_by("index").stream()]


async def test_start_run_writes_one_case_doc_per_case_and_finalizes_the_run():
    await seed_model_registry()
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
    _add_cases(project_id, prompt_id, admin["id_token"], n=3)

    started = client.post(
        f"/projects/{project_id}/prompts/{prompt_id}/runs",
        json={"text": "Summarize: {{ticket_text}}"}, headers=auth_headers(admin["id_token"]),
    )
    assert started.status_code == 201
    run_id = started.json()["runId"]
    # A freshly POSTed prompt has no versions yet (latestVersion starts at 0), so starting a
    # run with new draft text creates the prompt's very first version.
    assert started.json()["versionN"] == 1

    cases = await _case_docs(project_id, prompt_id, run_id)
    assert len(cases) == 3
    assert [c["index"] for c in cases] == [0, 1, 2]
    assert all(c["status"] == "done" for c in cases)

    fs = await get_firestore_client()
    run_snap = await (
        fs.collection("projects").document(project_id).collection("prompts").document(prompt_id)
        .collection("runs").document(run_id).get()
    )
    run_doc = run_snap.to_dict() or {}
    assert run_doc["status"] == "complete"
    assert run_doc["composite"] is not None

    prompt_snap = await (
        fs.collection("projects").document(project_id).collection("prompts").document(prompt_id).get()
    )
    assert (prompt_snap.to_dict() or {})["bestScore"] == run_doc["composite"]


async def test_rerunning_identical_text_reuses_the_version_and_never_lowers_bestscore():
    await seed_model_registry()
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
    _add_cases(project_id, prompt_id, admin["id_token"], n=1)

    fs = await get_firestore_client()
    prompt_ref = fs.collection("projects").document(project_id).collection("prompts").document(prompt_id)

    first = client.post(
        f"/projects/{project_id}/prompts/{prompt_id}/runs",
        json={"text": "v1 text"}, headers=auth_headers(admin["id_token"]),
    ).json()
    best_after_first = (await prompt_ref.get()).to_dict()["bestScore"]

    # Re-running the *same* text creates no new version (versionN is reused) — FakeLLMProvider
    # is deterministic per prompt+output+expected, so finalize's "only raise bestScore" guard
    # (never lower it) is exercised even though this second run scores identically.
    second = client.post(
        f"/projects/{project_id}/prompts/{prompt_id}/runs",
        json={"text": "v1 text"}, headers=auth_headers(admin["id_token"]),
    ).json()
    assert second["versionN"] == first["versionN"]
    best_after_second = (await prompt_ref.get()).to_dict()["bestScore"]
    assert best_after_second == best_after_first


async def test_estimate_returns_execution_and_grading_rows_scaled_by_dataset_size():
    await seed_model_registry()
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
    _add_cases(project_id, prompt_id, admin["id_token"], n=4)

    resp = client.get(
        f"/projects/{project_id}/prompts/{prompt_id}/runs/estimate",
        params={"text": "Summarize: {{ticket_text}}"}, headers=auth_headers(admin["id_token"]),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["nCases"] == 4
    assert [r["stage"] for r in body["rows"]] == ["Execution", "Model grading"]
    assert body["totalCost"] > 0


async def test_human_grade_write_changes_what_blend_run_computes_for_that_case():
    """PUT human-grade persists humanScore; the blended composite is a read-time
    computation (blend_run) over the case docs, never re-stored on the run doc."""
    await seed_model_registry()
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
    _add_cases(project_id, prompt_id, admin["id_token"], n=1)

    run_id = client.post(
        f"/projects/{project_id}/prompts/{prompt_id}/runs",
        json={"text": "v2 text"}, headers=auth_headers(admin["id_token"]),
    ).json()["runId"]
    cases_before = await _case_docs(project_id, prompt_id, run_id)
    case_id = next(iter(cases_before))["caseId"]

    def _to_case_result(d: dict[str, object]) -> CaseResult:
        return CaseResult(
            index=d["index"], case_id=d["caseId"], output=d["output"], code_score=d["codeScore"],
            model_score=d["modelScore"], human_score=d["humanScore"], weakness=d["weakness"],
            reasoning=d["reasoning"], tokens_in=d["tokensIn"], tokens_out=d["tokensOut"],
            status=d["status"], error=d["error"],
        )

    stats_before = blend_run([_to_case_result(d) for d in cases_before], EQUAL_WEIGHTS)
    assert stats_before.human_count == 0

    graded = client.put(
        f"/projects/{project_id}/prompts/{prompt_id}/runs/{run_id}/cases/{case_id}/human-grade",
        json={"score": 10.0}, headers=auth_headers(admin["id_token"]),
    )
    assert graded.status_code == 200

    cases_after = await _case_docs(project_id, prompt_id, run_id)
    stats_after = blend_run([_to_case_result(d) for d in cases_after], EQUAL_WEIGHTS)
    assert stats_after.human_count == 1
    assert stats_after.composite != stats_before.composite
