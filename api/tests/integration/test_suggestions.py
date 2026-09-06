# api/tests/integration/test_suggestions.py
from fastapi.testclient import TestClient

from app.deps import get_llm_provider
from app.domain.suggestions import FIXERS
from app.main import app
from app.ports.llm import LLMCallError
from tests.integration.conftest import auth_headers, create_emulator_user

client = TestClient(app)

TRIAGE_PROMPT = (
    "Summarize the support ticket and figure out how urgent it is. "
    "Try to be helpful and use your best judgement.\n\n"
    "Ticket: {{ticket_text}}\nUrgency levels: {{urgency_levels}}\n\nGive me an answer."
)


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


def test_contributor_gets_one_suggestion_per_failing_rule():
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
    resp = client.post(
        f"/projects/{project_id}/prompts/{prompt_id}/suggestions",
        json={"text": TRIAGE_PROMPT},
        headers=auth_headers(admin["id_token"]),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert {s["ruleId"] for s in body} == {"clear", "specific", "xml", "examples"}
    for s in body:
        assert s["oldText"] == TRIAGE_PROMPT
        assert s["newText"] != TRIAGE_PROMPT
        assert s["evidence"]


def test_no_suggestions_when_every_rule_already_passes():
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
    passing_text = (
        "Summarize the ticket and classify its urgency.\n\n"
        "<ticket>\n{{ticket_text}}\n</ticket>\n"
        'Respond only with valid JSON matching this schema: {"output": string}.\n\n'
        'For example: {"output": "high"}.'
    )
    resp = client.post(
        f"/projects/{project_id}/prompts/{prompt_id}/suggestions",
        json={"text": passing_text},
        headers=auth_headers(admin["id_token"]),
    )
    assert resp.json() == []


class _AlwaysFailingLLM:
    async def execute(self, prompt, model):
        raise LLMCallError("unreachable in this test")

    async def grade(self, prompt, output, expected, model):
        raise LLMCallError("unreachable in this test")

    async def suggest(self, prompt, technique, evidence, model):
        raise LLMCallError("simulated Gemini outage")

    async def generate_cases(self, prompt, n, model):
        raise LLMCallError("unreachable in this test")

    async def count_tokens(self, text, model):
        raise LLMCallError("unreachable in this test")


def test_suggestions_fall_back_to_the_static_fixer_when_the_model_call_fails():
    app.dependency_overrides[get_llm_provider] = lambda: _AlwaysFailingLLM()
    try:
        admin = _bootstrap("asha@acme.dev")
        project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
        resp = client.post(
            f"/projects/{project_id}/prompts/{prompt_id}/suggestions",
            json={"text": TRIAGE_PROMPT}, headers=auth_headers(admin["id_token"]),
        )
        body = {s["ruleId"]: s for s in resp.json()}
        assert body["clear"]["newText"] == FIXERS["clear"](TRIAGE_PROMPT)
    finally:
        from app.adapters.fake_llm import FakeLLMProvider

        app.dependency_overrides[get_llm_provider] = lambda: FakeLLMProvider()


def test_viewer_gets_403_generating_suggestions():
    admin = _bootstrap("asha@acme.dev")
    project_id, prompt_id = _make_project_and_prompt(admin["id_token"])
    viewer = _bootstrap("dev@acme.dev")
    resp = client.post(
        f"/projects/{project_id}/prompts/{prompt_id}/suggestions",
        json={"text": TRIAGE_PROMPT},
        headers=auth_headers(viewer["id_token"]),
    )
    assert resp.status_code == 403
