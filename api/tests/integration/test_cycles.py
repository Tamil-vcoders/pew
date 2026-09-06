# api/tests/integration/test_cycles.py
"""Emulator-backed integration tests for the improvement cycle — the orchestration layer
(services/cycles.py + routes/cycles.py + FirestoreCycleRepo) glued to real Firestore
transactions and FakeLLMProvider. Domain state-machine logic is exhaustively unit-tested in
tests/test_domain_cycle.py; these tests exercise the infrastructure wiring around it: one
active cycle enforced by a real Firestore precondition, budget-check-before-spend, dataset
freeze, config-snapshot isolation, and doc-only resume.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.adapters.fake_llm import FakeLLMProvider
from app.adapters.firestore_repos import FirestoreCycleRepo
from app.deps import get_firestore_client
from app.main import app
from tests.fakes import FAIL_MARKER, FaultyFakeLLMProvider
from tests.integration.conftest import auth_headers, create_emulator_user, seed_model_registry

client = TestClient(app)


def _bootstrap(email: str) -> dict[str, str]:
    user = create_emulator_user(email)
    client.get("/me", headers=auth_headers(user["id_token"]))
    return user


def _make_project_and_prompt(token: str, *, name: str = "Support automation") -> tuple[str, str]:
    project_id = client.post("/projects", json={"name": name}, headers=auth_headers(token)).json()["id"]
    prompt_id = client.post(
        f"/projects/{project_id}/prompts", json={"name": "Ticket triage", "tags": []},
        headers=auth_headers(token),
    ).json()["id"]
    return project_id, prompt_id


def _add_cases(project_id: str, prompt_id: str, token: str, n: int) -> None:
    for i in range(n):
        resp = client.post(
            f"/projects/{project_id}/prompts/{prompt_id}/dataset",
            json={"input": f"ticket {i}", "expected": "high"}, headers=auth_headers(token),
        )
        assert resp.status_code == 201


def _patch_cfg(project_id: str, token: str, **cfg: object) -> None:
    resp = client.patch(f"/projects/{project_id}", json=cfg, headers=auth_headers(token))
    assert resp.status_code == 200, resp.text


def _start(project_id: str, prompt_id: str, token: str) -> dict[str, object]:
    resp = client.post(
        "/cycles", json={"projectId": project_id, "promptId": prompt_id}, headers=auth_headers(token)
    )
    return {"status": resp.status_code, "body": resp.json()}


async def _read_cycle_doc(cycle_id: str) -> dict[str, object]:
    """Reads the cycle doc straight from Firestore — the source of truth the real UI would
    see via onSnapshot. Needed after any action that schedules a background task (confirm-
    iteration's run execution, in particular): the HTTP response returned by that action
    reflects the state at the moment it *scheduled* the background work, not what the
    background work later did, even though (per inline_tasks' in-request execution model)
    the background work has, in fact, already finished by the time the response is
    received here."""
    fs = await get_firestore_client()
    snap = await fs.collection("cycles").document(cycle_id).get()
    assert snap.exists
    return snap.to_dict() or {}


async def _count_runs(project_id: str, prompt_id: str) -> int:
    fs = await get_firestore_client()
    docs = [
        d async for d in
        fs.collection("projects").document(project_id).collection("prompts").document(prompt_id)
        .collection("runs").stream()
    ]
    return len(docs)


# ---------- AC-F.13 / devspec §1.2: one active cycle, globally ----------


async def test_starting_a_second_cycle_while_one_is_active_is_refused():
    await seed_model_registry()
    admin = _bootstrap("asha@acme.dev")
    project_a, prompt_a = _make_project_and_prompt(admin["id_token"], name="Project A")
    project_b, prompt_b = _make_project_and_prompt(admin["id_token"], name="Project B")

    first = _start(project_a, prompt_a, admin["id_token"])
    assert first["status"] == 201

    second = _start(project_b, prompt_b, admin["id_token"])
    assert second["status"] == 409

    # Stopping the first frees the marker up for a new cycle.
    stop = client.post(f"/cycles/{first['body']['id']}/stop", headers=auth_headers(admin["id_token"]))
    assert stop.status_code == 200
    third = _start(project_b, prompt_b, admin["id_token"])
    assert third["status"] == 201


# NOTE: a genuine multi-thread concurrent-start test was tried here and dropped. Firing two
# TestClient.post() calls from separate OS threads via asyncio.to_thread races the shared
# `firestore.AsyncClient`'s grpc.aio channel across two different event loops, which raises
# "attached to a different loop" — precisely the documented constraint in
# app/deps.py::get_firestore_client's docstring, not a bug in the marker-doc transaction
# itself. Proving genuine network-level concurrency would need a real uvicorn process, which
# is out of scope here; the sequential test above already proves the transaction's real
# Firestore precondition (not just request ordering) by reusing the SAME marker document
# across two independent start attempts.


# ---------- AC-9.5 / AC-F.12: budget checked before any spend ----------


async def test_budget_cap_ends_the_cycle_before_starting_the_iteration_and_creates_no_run():
    await seed_model_registry()
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
    _add_cases(project_id, prompt_id, admin["id_token"], n=1)
    # gt=0 on the cfg field forbids exactly 0 — use a budget far smaller than any real
    # estimate (registry rates are $/1M tokens, so a single-case iteration costs cents).
    _patch_cfg(project_id, admin["id_token"], budget=0.0001)

    started = _start(project_id, prompt_id, admin["id_token"])
    assert started["status"] == 201
    cycle_id = started["body"]["id"]
    token = admin["id_token"]

    approved = client.post(f"/cycles/{cycle_id}/approve-dataset", headers=auth_headers(token))
    assert approved.status_code == 200
    assert approved.json()["stage"] == "preview"

    confirmed = client.post(
        f"/cycles/{cycle_id}/confirm-iteration", json={"text": "Summarize: {{ticket_text}}"},
        headers=auth_headers(token),
    )
    assert confirmed.status_code == 200
    body = confirmed.json()
    assert body["status"] == "ended"
    assert body["endReason"] == "budget-cap"
    assert body["iteration"] == 0  # never incremented — no iteration was actually started
    assert any("exceeds remaining budget" in msg for msg in [e["message"] for e in body["log"]])

    assert await _count_runs(project_id, prompt_id) == 0


# ---------- Dataset freeze + global manual-run block ----------


async def test_dataset_is_frozen_once_a_cycle_reaches_iteration_one():
    await seed_model_registry()
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
    _add_cases(project_id, prompt_id, admin["id_token"], n=1)
    other_project_id, other_prompt_id = _make_project_and_prompt(admin["id_token"], name="Untouched")
    _add_cases(other_project_id, other_prompt_id, admin["id_token"], n=1)
    token = admin["id_token"]

    started = _start(project_id, prompt_id, token)
    cycle_id = started["body"]["id"]
    client.post(f"/cycles/{cycle_id}/approve-dataset", headers=auth_headers(token))
    confirmed = client.post(
        f"/cycles/{cycle_id}/confirm-iteration", json={"text": "Summarize: {{ticket_text}}"},
        headers=auth_headers(token),
    )
    assert confirmed.json()["iteration"] == 1

    frozen = client.post(
        f"/projects/{project_id}/prompts/{prompt_id}/dataset",
        json={"input": "new", "expected": "x"}, headers=auth_headers(token),
    )
    assert frozen.status_code == 409

    unaffected = client.post(
        f"/projects/{other_project_id}/prompts/{other_prompt_id}/dataset",
        json={"input": "new", "expected": "x"}, headers=auth_headers(token),
    )
    assert unaffected.status_code == 201


async def test_manual_run_is_blocked_globally_while_any_cycle_is_active():
    await seed_model_registry()
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
    _add_cases(project_id, prompt_id, admin["id_token"], n=1)
    other_project_id, other_prompt_id = _make_project_and_prompt(admin["id_token"], name="Other")
    token = admin["id_token"]

    _start(project_id, prompt_id, token)

    blocked_same = client.post(
        f"/projects/{project_id}/prompts/{prompt_id}/runs",
        json={"text": "x"}, headers=auth_headers(token),
    )
    assert blocked_same.status_code == 409

    blocked_other = client.post(
        f"/projects/{other_project_id}/prompts/{other_prompt_id}/runs",
        json={"text": "x"}, headers=auth_headers(token),
    )
    assert blocked_other.status_code == 409


# ---------- Config-snapshot isolation ----------


async def test_project_cfg_is_locked_while_its_cycle_is_active_but_name_is_not():
    await seed_model_registry()
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
    _add_cases(project_id, prompt_id, admin["id_token"], n=1)
    token = admin["id_token"]

    _start(project_id, prompt_id, token)

    locked = client.patch(f"/projects/{project_id}", json={"budget": 99.0}, headers=auth_headers(token))
    assert locked.status_code == 409

    renamed = client.patch(f"/projects/{project_id}", json={"name": "Renamed mid-cycle"}, headers=auth_headers(token))
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Renamed mid-cycle"


# ---------- AC-9.3 / target-met ----------


async def test_cycle_ends_target_met_when_the_first_iterations_composite_clears_a_low_target():
    await seed_model_registry()
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
    _add_cases(project_id, prompt_id, admin["id_token"], n=1)
    token = admin["id_token"]
    # FakeLLMProvider's fake execution output never contains the case's `expected` text, so
    # code_score is always 0; the model grader scores 1-10, so with equal weights the
    # composite floor is 0.5 — a target of 0.4 is guaranteed met on the very first iteration.
    _patch_cfg(project_id, token, target=0.4, maxIter=5, budget=10.0)

    started = _start(project_id, prompt_id, token)
    cycle_id = started["body"]["id"]
    client.post(f"/cycles/{cycle_id}/approve-dataset", headers=auth_headers(token))
    client.post(
        f"/cycles/{cycle_id}/confirm-iteration", json={"text": "Summarize: {{ticket_text}}"},
        headers=auth_headers(token),
    )
    # Attended mode pauses at "grading" once the run finishes — the user (or, in the
    # Playwright pass, the UI) explicitly continues to trigger the actual scoring decision.
    ended = client.post(f"/cycles/{cycle_id}/continue", headers=auth_headers(token)).json()

    assert ended["status"] == "ended"
    assert ended["endReason"] == "target-met"
    assert ended["bestN"] is not None


# ---------- AC-9.4: iteration cap + best version across all iterations + select-candidate ----------


async def test_iteration_cap_flags_the_best_version_and_select_candidate_advances_the_cycle():
    await seed_model_registry()
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
    _add_cases(project_id, prompt_id, admin["id_token"], n=1)
    token = admin["id_token"]
    headers = auth_headers(token)
    # Unreachable target (composite tops out at 5.0 — see the target-met test above) forces
    # every iteration through to the cap; a hedging, template-free prompt guarantees at
    # least one failing validation rule so a real candidate gets generated to select.
    _patch_cfg(project_id, token, target=100.0, maxIter=1, budget=10.0)

    started = _start(project_id, prompt_id, token)
    cycle_id = started["body"]["id"]
    client.post(f"/cycles/{cycle_id}/approve-dataset", headers=headers)
    hedging_text = "Try to be helpful and summarize the ticket. Give me an answer."
    client.post(f"/cycles/{cycle_id}/confirm-iteration", json={"text": hedging_text}, headers=headers)

    # Attended mode pauses at "grading" after the run completes (confirm-iteration's own
    # response reflects the moment it scheduled the run, not the run's outcome — see
    # _read_cycle_doc's docstring).
    assert (await _read_cycle_doc(cycle_id))["stage"] == "grading"
    after_grading = client.post(f"/cycles/{cycle_id}/continue", headers=headers).json()
    assert after_grading["status"] == "ended"
    assert after_grading["endReason"] == "iteration-cap"
    assert after_grading["bestN"] is not None
    assert len(after_grading["scores"]) == 1


async def test_select_candidate_applies_one_technique_and_returns_to_preview():
    await seed_model_registry()
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
    _add_cases(project_id, prompt_id, admin["id_token"], n=1)
    token = admin["id_token"]
    headers = auth_headers(token)
    # Enough iterations left that after_score proceeds to "suggest" rather than ending on
    # the cap, and an unreachable target so it doesn't end target-met either.
    _patch_cfg(project_id, token, target=100.0, maxIter=5, budget=10.0)

    started = _start(project_id, prompt_id, token)
    cycle_id = started["body"]["id"]
    client.post(f"/cycles/{cycle_id}/approve-dataset", headers=headers)
    hedging_text = "Try to be helpful and summarize the ticket. Give me an answer."
    client.post(f"/cycles/{cycle_id}/confirm-iteration", json={"text": hedging_text}, headers=headers)
    assert (await _read_cycle_doc(cycle_id))["stage"] == "grading"

    suggesting = client.post(f"/cycles/{cycle_id}/continue", headers=headers).json()
    assert suggesting["stage"] == "suggesting"
    assert len(suggesting["pending"]["candidates"]) >= 1

    applied = client.post(
        f"/cycles/{cycle_id}/select-candidate", json={"index": 0}, headers=headers
    ).json()
    assert applied["stage"] == "preview"
    assert applied["pending"] is None
    assert applied["currentVersionN"] is not None


# ---------- AC-F.11: flat score (attended warns once, may continue) ----------


async def test_no_suggestions_ends_the_cycle_when_every_validation_rule_already_passes():
    await seed_model_registry()
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
    _add_cases(project_id, prompt_id, admin["id_token"], n=1)
    token = admin["id_token"]
    headers = auth_headers(token)
    _patch_cfg(project_id, token, target=100.0, maxIter=5, budget=10.0)

    started = _start(project_id, prompt_id, token)
    cycle_id = started["body"]["id"]
    client.post(f"/cycles/{cycle_id}/approve-dataset", headers=headers)
    # Passes every catalogue rule: no hedging, an explicit JSON instruction, no template
    # variables to wrap, and a worked example.
    clean_text = 'Respond only with valid JSON. For example: {"result": "ok"}.'
    client.post(f"/cycles/{cycle_id}/confirm-iteration", json={"text": clean_text}, headers=headers)
    assert (await _read_cycle_doc(cycle_id))["stage"] == "grading"

    ended = client.post(f"/cycles/{cycle_id}/continue", headers=headers).json()
    assert ended["status"] == "ended"
    assert ended["endReason"] == "no-suggestions"


# ---------- Doc-only resume ----------


async def test_a_freshly_constructed_repo_resumes_the_cycle_from_its_doc_alone():
    """Simulates a different process instance picking the cycle up mid-flight: no Python
    object from the calls above is reused — only the cycle_id and a brand-new
    FirestoreCycleRepo bound to a fresh Firestore client."""
    await seed_model_registry()
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
    _add_cases(project_id, prompt_id, admin["id_token"], n=1)
    token = admin["id_token"]

    started = _start(project_id, prompt_id, token)
    cycle_id = started["body"]["id"]
    client.post(f"/cycles/{cycle_id}/approve-dataset", headers=auth_headers(token))

    fresh_client = await get_firestore_client()
    fresh_repo = FirestoreCycleRepo(fresh_client)
    resumed = await fresh_repo.get(cycle_id)
    assert resumed is not None
    assert resumed.stage == "preview"
    assert resumed.prompt_id == prompt_id
    assert resumed.config.budget == 0.6  # the untouched default — proves the snapshot round-trips

    # Driving the next transition through the SAME HTTP surface (which re-hydrates
    # server-side exactly as this fresh repo just did independently) proceeds normally.
    confirmed = client.post(
        f"/cycles/{cycle_id}/confirm-iteration", json={"text": "Summarize: {{ticket_text}}"},
        headers=auth_headers(token),
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["iteration"] == 1


# ---------- Auto mode ----------


async def test_auto_mode_cycle_advances_unattended_to_an_end_reason():
    await seed_model_registry()
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
    _add_cases(project_id, prompt_id, admin["id_token"], n=1)
    token = admin["id_token"]
    _patch_cfg(project_id, token, target=0.4, maxIter=2, budget=10.0, auto=True)

    started = _start(project_id, prompt_id, token)
    assert started["status"] == 201
    cycle_id = started["body"]["id"]
    assert started["body"]["configSnapshot"]["auto"] is True

    # Auto mode chains dataset-approve -> confirm-iteration entirely as background tasks
    # attached to this same request/response cycle (no Cloud Tasks in Phase 4 — see
    # services/cycles.py's module docstring), so by the time the POST above has returned,
    # the whole chain has already run to completion. No GET /cycles/{id} route exists (by
    # design — the browser reads Firestore directly via onSnapshot); read the doc straight
    # from Firestore here too, mirroring what the UI would see.
    fs = await get_firestore_client()
    snap = await fs.collection("cycles").document(cycle_id).get()
    doc = snap.to_dict() or {}
    assert doc["status"] == "ended"
    assert doc["endReason"] == "target-met"


# ---------- All-cases-errored iteration (Phase 6 hardening) ----------


async def test_continuing_from_grading_after_every_case_errors_treats_composite_as_zero():
    from app.deps import get_llm_provider

    app.dependency_overrides[get_llm_provider] = lambda: FaultyFakeLLMProvider()
    try:
        await seed_model_registry()
        admin = _bootstrap("asha@acme.dev")
        project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
        _add_cases(project_id, prompt_id, admin["id_token"], n=1)
        token = admin["id_token"]
        headers = auth_headers(token)
        _patch_cfg(project_id, token, target=0.4, maxIter=1, budget=10.0)

        started = _start(project_id, prompt_id, token)
        cycle_id = started["body"]["id"]
        client.post(f"/cycles/{cycle_id}/approve-dataset", headers=headers)
        client.post(
            f"/cycles/{cycle_id}/confirm-iteration",
            json={"text": f"Summarize: {{{{ticket_text}}}} {FAIL_MARKER}"},
            headers=headers,
        )
        assert (await _read_cycle_doc(cycle_id))["stage"] == "grading"

        ended = client.post(f"/cycles/{cycle_id}/continue", headers=headers)
        assert ended.status_code == 200, ended.text
        body = ended.json()
        assert body["status"] == "ended"
        assert body["endReason"] == "iteration-cap"  # composite forced to 0.0 never meets target=0.4
    finally:
        app.dependency_overrides[get_llm_provider] = lambda: FakeLLMProvider()
