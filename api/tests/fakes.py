"""Shared test doubles for fault-injection scenarios (devspec §10 Phase 6 hardening).
Every prompt containing one of the marker constants below fails deterministically when
executed; anything else behaves exactly like FakeLLMProvider. Markers are sentinel strings,
never real-looking content — the content-privacy rule (CLAUDE.md) applies to test fixtures
too.
"""
from __future__ import annotations

import asyncio

from app.adapters.fake_llm import FakeLLMProvider
from app.ports.llm import LLMCallError, LLMQuotaExceededError

FAIL_MARKER = "SENTINEL_FORCE_FAIL_7f3a2b"
QUOTA_MARKER = "SENTINEL_FORCE_QUOTA_91cd04"


class FaultyFakeLLMProvider(FakeLLMProvider):
    """execute() fails deterministically for prompts carrying FAIL_MARKER/QUOTA_MARKER;
    every other call (including grade/suggest/generate_cases/count_tokens) is unchanged."""

    async def execute(self, prompt: str, model: str) -> tuple[str, int, int]:
        if FAIL_MARKER in prompt:
            raise LLMCallError("simulated: all 3 retries exhausted")
        if QUOTA_MARKER in prompt:
            raise LLMQuotaExceededError(
                "Gemini API quota exhausted after 3 attempts — wait a few minutes "
                "before retrying."
            )
        return await super().execute(prompt, model)


class ConcurrencyTrackingLLMProvider(FakeLLMProvider):
    """Wraps execute() with a small artificial delay and tracks the high-water mark of
    concurrent in-flight calls — proves MAX_CONCURRENCY actually bounds execute_run's
    fan-out under load (devspec §10 Phase 6: 'confirm the semaphore holds at 3')."""

    def __init__(self) -> None:
        self._in_flight = 0
        self.peak_concurrency = 0

    async def execute(self, prompt: str, model: str) -> tuple[str, int, int]:
        self._in_flight += 1
        self.peak_concurrency = max(self.peak_concurrency, self._in_flight)
        await asyncio.sleep(0.01)
        try:
            return await super().execute(prompt, model)
        finally:
            self._in_flight -= 1
