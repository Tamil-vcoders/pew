"""Unit tests for services/suggestions.py::draft_suggestions — extracted from
routes/suggestions.py's inline loop so the cycle service can reuse it (Phase 4)."""
from __future__ import annotations

from app.adapters.fake_llm import FakeLLMProvider
from app.domain.models import SuggestionDraft
from app.domain.suggestions import Suggestion
from app.ports.llm import LLMCallError
from app.services.suggestions import draft_suggestions


class _AlwaysFailsLLM(FakeLLMProvider):
    async def suggest(self, prompt: str, technique: str, evidence: str, model: str) -> SuggestionDraft:
        raise LLMCallError("provider unavailable")


async def test_draft_suggestions_uses_the_llms_rewrite_for_each_candidate():
    candidates = [Suggestion(rule_id="clear", technique="Clear and direct", evidence="hedging", old_text="a", new_text="static-fix")]
    drafted = await draft_suggestions(candidates, "some-model", FakeLLMProvider())
    assert len(drafted) == 1
    assert drafted[0].rule_id == "clear"
    assert drafted[0].new_text != "static-fix"  # replaced by the LLM's drafted rewrite
    assert drafted[0].new_text.startswith("a\n\n[fake rewrite applying Clear and direct]")


async def test_draft_suggestions_falls_back_to_the_static_fixer_on_llm_failure():
    candidates = [Suggestion(rule_id="clear", technique="Clear and direct", evidence="hedging", old_text="a", new_text="static-fix")]
    drafted = await draft_suggestions(candidates, "some-model", _AlwaysFailsLLM())
    assert drafted == candidates  # unchanged — the static fixer's rewrite stands


async def test_draft_suggestions_preserves_candidate_order():
    candidates = [
        Suggestion(rule_id="clear", technique="Clear and direct", evidence="e1", old_text="a", new_text="f1"),
        Suggestion(rule_id="xml", technique="XML structure", evidence="e2", old_text="a", new_text="f2"),
    ]
    drafted = await draft_suggestions(candidates, "some-model", FakeLLMProvider())
    assert [s.rule_id for s in drafted] == ["clear", "xml"]


async def test_draft_suggestions_of_empty_list_is_empty():
    assert await draft_suggestions([], "some-model", FakeLLMProvider()) == []
