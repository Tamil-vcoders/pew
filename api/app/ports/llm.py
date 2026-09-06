# api/app/ports/llm.py
from __future__ import annotations

from typing import Protocol

from app.domain.models import GraderVerdict, SuggestionDraft


class LLMCallError(Exception):
    """A model call failed after every retry. Callers must record this as a visible
    `status: "error"` marker — never silently score the case zero (devspec §6.2)."""


class LLMProvider(Protocol):
    async def execute(self, prompt: str, model: str) -> tuple[str, int, int]:
        """Run the rendered prompt. Returns (output_text, tokens_in, tokens_out)."""
        ...

    async def grade(self, prompt: str, output: str, expected: str, model: str) -> GraderVerdict:
        """Grade an output at temperature 0 with structured JSON (score/weakness/reasoning)."""
        ...

    async def suggest(self, prompt: str, technique: str, evidence: str, model: str) -> SuggestionDraft:
        """Draft a rewrite applying exactly one technique, grounded in the evidence."""
        ...

    async def generate_cases(self, prompt: str, n: int, model: str) -> list[dict[str, str]]:
        """Generate `n` dataset cases as [{"input": ..., "expected": ...}, ...]."""
        ...

    async def count_tokens(self, text: str, model: str) -> int:
        ...
