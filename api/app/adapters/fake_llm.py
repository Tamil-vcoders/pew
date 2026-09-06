"""Deterministic LLMProvider test double — every test in this repo uses this, never the
real Gemini adapter, so CI never spends tokens (CLAUDE.md testing conventions).

Outputs are keyed on a hash of the input text (the prototype's mulberry32(hashStr(...))
trick, docs/prototype.jsx:36-48, reimplemented here) so the same input always produces the
same fake output/score across runs — tests can assert on specific values.
"""
from __future__ import annotations

from app.domain.models import GraderVerdict, SuggestionDraft


def _hash_str(s: str) -> int:
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def _mulberry32(seed: int) -> float:
    seed = (seed + 0x6D2B79F5) & 0xFFFFFFFF
    t = seed
    t = (t ^ (t >> 15)) * (1 | t) & 0xFFFFFFFF
    t = (t + (((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF)) ^ t
    t &= 0xFFFFFFFF
    return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296


class FakeLLMProvider:
    """Structurally satisfies LLMProvider (Protocol) — no inheritance needed."""

    async def execute(self, prompt: str, model: str) -> tuple[str, int, int]:
        seed = _hash_str(prompt)
        return f"fake output for seed {seed}", 100, 50

    async def grade(self, prompt: str, output: str, expected: str, model: str) -> GraderVerdict:
        rng = _mulberry32(_hash_str(prompt + "|" + output + "|" + expected))
        score = round(1 + rng * 9, 1)
        return GraderVerdict(
            score=score,
            weakness=None if score >= 6.5 else "clarity",
            reasoning=f"fake grader reasoning (score {score})",
        )

    async def suggest(self, prompt: str, technique: str, evidence: str, model: str) -> SuggestionDraft:
        return SuggestionDraft(text=f"{prompt}\n\n[fake rewrite applying {technique}]")

    async def generate_cases(self, prompt: str, n: int, model: str) -> list[dict[str, str]]:
        return [
            {"input": f"fake generated input {i}", "expected": f"fake expected {i}"}
            for i in range(n)
        ]

    async def count_tokens(self, text: str, model: str) -> int:
        return max(1, len(text) // 4)
