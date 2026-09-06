"""Unit test for the devspec §15 rehearsal-mode flag: get_llm_provider() returns
FakeLLMProvider when Settings.use_fake_llm is set, so local demos/rehearsals never spend
real Gemini tokens or hit free-tier rate limits."""
from __future__ import annotations

from app.adapters.fake_llm import FakeLLMProvider
from app.adapters.gemini import GeminiProvider
from app.config import Settings
from app.deps import get_llm_provider


def test_get_llm_provider_returns_fake_when_use_fake_llm_is_set(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr("app.deps.get_settings", lambda: Settings(use_fake_llm=True))
    assert isinstance(get_llm_provider(), FakeLLMProvider)


def test_get_llm_provider_returns_real_gemini_by_default(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr("app.deps.get_settings", lambda: Settings(use_fake_llm=False, gemini_api_key="k"))
    assert isinstance(get_llm_provider(), GeminiProvider)
