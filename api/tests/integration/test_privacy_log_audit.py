"""Devspec §14 privacy audit: run a full cycle end-to-end with sentinel strings baked into
the prompt and case content, then assert none of those sentinels ever reach captured stdout
(where Cloud Logging would scrape them in production). Sentinels stand in for real
prompt/case content per the content-privacy rule — even test fixtures must never look like
real data.

Uses `capsys` (object-level capture): app.observability's handler is a _LiveStdoutHandler
that re-resolves `sys.stdout` on every emit rather than binding it once at construction, so
it always writes to whatever object `sys.stdout` currently points to — including capsys's
per-test monkeypatched replacement. No special pytest flags (e.g. `-s`) are required.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from tests.integration.conftest import auth_headers, create_emulator_user, seed_model_registry

client = TestClient(app)

SENTINEL_PROMPT = "SENTINEL_PROMPT_MARKER_7f3a2b"
SENTINEL_CASE_INPUT = "SENTINEL_CASE_INPUT_MARKER_91cd"
SENTINEL_CASE_EXPECTED = "SENTINEL_CASE_EXPECTED_MARKER_04ee"


async def test_a_full_cycle_never_logs_prompt_or_case_content(capsys):
    await seed_model_registry()
    user = create_emulator_user("asha@acme.dev")
    client.get("/me", headers=auth_headers(user["id_token"]))
    headers = auth_headers(user["id_token"])

    project_id = client.post("/projects", json={"name": "Privacy audit"}, headers=headers).json()["id"]
    prompt_id = client.post(
        f"/projects/{project_id}/prompts", json={"name": "Audit prompt", "tags": []}, headers=headers,
    ).json()["id"]
    client.post(
        f"/projects/{project_id}/prompts/{prompt_id}/dataset",
        json={"input": SENTINEL_CASE_INPUT, "expected": SENTINEL_CASE_EXPECTED}, headers=headers,
    )
    client.patch(f"/projects/{project_id}", json={"target": 100.0, "maxIter": 1, "budget": 10.0}, headers=headers)

    started = client.post("/cycles", json={"projectId": project_id, "promptId": prompt_id}, headers=headers).json()
    cycle_id = started["id"]
    client.post(f"/cycles/{cycle_id}/approve-dataset", headers=headers)
    client.post(
        f"/cycles/{cycle_id}/confirm-iteration",
        json={"text": f"Summarize: {{{{input}}}} — {SENTINEL_PROMPT}"}, headers=headers,
    )
    client.post(f"/cycles/{cycle_id}/continue", headers=headers)
    client.post(f"/cycles/{cycle_id}/stop", headers=headers)

    captured = capsys.readouterr().out
    # Non-vacuousness guard: fail loudly (rather than trivially passing on empty capture) if
    # log_event's output stopped reaching capsys for any reason — see module docstring.
    assert "cycle_started" in captured and "cycle_ended" in captured and "run_finalized" in captured
    assert SENTINEL_PROMPT not in captured
    assert SENTINEL_CASE_INPUT not in captured
    assert SENTINEL_CASE_EXPECTED not in captured
