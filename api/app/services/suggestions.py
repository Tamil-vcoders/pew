"""Gemini-drafted suggestion rewrites — extracted from routes/suggestions.py's original
inline loop so the cycle service (Phase 4) can reuse the same draft-and-fallback behavior
without importing a route module."""
from __future__ import annotations

from app.domain.suggestions import Suggestion
from app.ports.llm import LLMCallError, LLMProvider


async def draft_suggestions(
    suggestions: list[Suggestion], model: str, llm: LLMProvider
) -> list[Suggestion]:
    """Drafts each given Suggestion's rewrite via llm.suggest, falling back to its static
    fixer text (already on `new_text`, from domain.suggestions.build_suggestions) on
    LLMCallError. Callers control how much drafting happens by pre-slicing the input list —
    this function doesn't filter or rank."""
    drafted: list[Suggestion] = []
    for s in suggestions:
        try:
            draft = await llm.suggest(s.old_text, s.technique, s.evidence, model)
            drafted.append(Suggestion(rule_id=s.rule_id, technique=s.technique, evidence=s.evidence, old_text=s.old_text, new_text=draft.text))
        except LLMCallError:
            drafted.append(s)
    return drafted
