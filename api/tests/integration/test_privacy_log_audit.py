"""Devspec §14 privacy audit: run a full cycle end-to-end with sentinel strings baked into
the prompt and case content, then assert none of those sentinels ever reach captured stdout
(where Cloud Logging would scrape them in production). Sentinels stand in for real
prompt/case content per the content-privacy rule — even test fixtures must never look like
real data.

Uses `capfd` (file-descriptor-level capture), not `capsys`: app.observability's StreamHandler
is constructed once at import/collection time, binding a `sys.stdout` object reference that
predates any per-test capsys monkeypatch, so capsys (object-level) can never observe its
writes here — verified empirically. capfd intercepts at the OS fd level instead, which is
also the more faithful model of what production Cloud Logging actually scrapes.
This test must run with `-s` (`--capture=no`): under the default global fd-capture, the
module-level handler's stream binds to the *global* capture's redirected fd at collection
time, one layer removed from the fresh per-test fd swap a capfd fixture request performs —
so `capfd.readouterr()` sees nothing. With `-s` disabling the global layer, the per-test
capfd fixture is the only redirection in play and the handler's writes land in it correctly.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from tests.integration.conftest import auth_headers, create_emulator_user, seed_model_registry

client = TestClient(app)

SENTINEL_PROMPT = "SENTINEL_PROMPT_MARKER_7f3a2b"
SENTINEL_CASE_INPUT = "SENTINEL_CASE_INPUT_MARKER_91cd"
SENTINEL_CASE_EXPECTED = "SENTINEL_CASE_EXPECTED_MARKER_04ee"


async def test_a_full_cycle_never_logs_prompt_or_case_content(capfd):
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

    captured = capfd.readouterr().out
    # Non-vacuousness guard: fail loudly (rather than trivially passing on empty capture) if
    # log_event's output stopped reaching capfd for any reason — see module docstring.
    assert "cycle_started" in captured and "cycle_ended" in captured and "run_finalized" in captured
    assert SENTINEL_PROMPT not in captured
    assert SENTINEL_CASE_INPUT not in captured
    assert SENTINEL_CASE_EXPECTED not in captured
