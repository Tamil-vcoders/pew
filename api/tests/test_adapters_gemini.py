"""Unit tests for GeminiProvider's response-parsing/retry behavior — no real network calls.
The genai client is swapped for an in-memory fake that returns canned response texts."""
from __future__ import annotations

import pytest

from app.adapters import gemini as gemini_module
from app.adapters.gemini import GeminiProvider
from app.ports.llm import LLMCallError


class _FakeResponse:
    def __init__(self, text: str | None) -> None:
        self.text = text


class _FakeModels:
    def __init__(self, texts: list[str | None]) -> None:
        self._texts = list(texts)
        self.calls = 0

    async def generate_content(self, *, model: str, contents: str, config: object = None) -> _FakeResponse:
        self.calls += 1
        return _FakeResponse(self._texts.pop(0))


class _FakeAio:
    def __init__(self, texts: list[str | None]) -> None:
        self.models = _FakeModels(texts)


class _FakeClient:
    def __init__(self, texts: list[str | None]) -> None:
        self.aio = _FakeAio(texts)


def _provider_with_responses(texts: list[str | None]) -> GeminiProvider:
    provider = GeminiProvider(api_key="unused")
    provider._client = _FakeClient(texts)  # type: ignore[assignment]
    return provider


@pytest.fixture(autouse=True)
def _no_real_sleep(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _instant_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr(gemini_module.asyncio, "sleep", _instant_sleep)


async def test_grade_parses_a_well_formed_response_on_the_first_try():
    provider = _provider_with_responses(['{"score": 8, "weakness": null, "reasoning": "good"}'])
    verdict = await provider.grade("prompt", "output", "expected", "gemini-2.5-flash")
    assert verdict.score == 8.0
    assert verdict.weakness is None
    assert verdict.reasoning == "good"


async def test_grade_retries_once_after_malformed_json_then_succeeds():
    provider = _provider_with_responses(["not json", '{"score": 5, "weakness": "clarity", "reasoning": "ok"}'])
    verdict = await provider.grade("prompt", "output", "expected", "gemini-2.5-flash")
    assert verdict.score == 5.0
    assert provider._client.aio.models.calls == 2  # type: ignore[attr-defined]


async def test_grade_raises_llm_call_error_after_malformed_json_on_every_attempt():
    provider = _provider_with_responses(["not json", "still not json", "nope"])
    with pytest.raises(LLMCallError):
        await provider.grade("prompt", "output", "expected", "gemini-2.5-flash")


async def test_grade_retries_when_a_required_field_is_missing():
    # A bare score with no weakness/reasoning must never be accepted (AC-4.5).
    provider = _provider_with_responses(
        ['{"score": 9}', '{"score": 9, "weakness": null, "reasoning": "complete"}']
    )
    verdict = await provider.grade("prompt", "output", "expected", "gemini-2.5-flash")
    assert verdict.reasoning == "complete"


async def test_grade_raises_when_every_attempt_is_missing_a_required_field():
    provider = _provider_with_responses(['{"score": 9}'] * 3)
    with pytest.raises(LLMCallError):
        await provider.grade("prompt", "output", "expected", "gemini-2.5-flash")
