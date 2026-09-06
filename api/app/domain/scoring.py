"""Code grader + composite blending — ported from docs/prototype.jsx's blendCase/
blendedStats (lines 201-216). Pure Python: zero google.*/firebase_admin imports.
"""
from __future__ import annotations

from app.domain.models import CaseResult, RunStats


def code_grade(output: str, expected: str) -> float:
    """Deterministic, model-free check: does the output contain the expected value?

    The fuller PRD's format-based code grader (AC-4.1: parse as JSON/Python/regex) needs
    an "expected format" field this build's Case schema doesn't carry (devspec §7 has only
    input/expected/order/source) — a case-insensitive substring match is the closest
    deterministic equivalent given the actual schema.
    """
    return 10.0 if expected.strip().lower() in output.lower() else 0.0


def blend_case(code: float, model: float, human: float | None, weights: dict[str, float]) -> float:
    """Weighted average of code + model (+ human, only when graded).

    Guards the zero-weights case: if every applicable weight is 0, there is nothing to
    divide by — return 0.0 rather than raising or dividing by zero.
    """
    parts: list[tuple[float, float]] = [(weights["code"], code), (weights["model"], model)]
    if human is not None:
        parts.append((weights["human"], human))
    denom = sum(w for w, _ in parts)
    if denom == 0:
        return 0.0
    return sum(w * v for w, v in parts) / denom


def blend_run(cases: list[CaseResult], weights: dict[str, float]) -> RunStats:
    """Aggregate composite/code/model averages across a run's cases.

    Cases with status == "error" are excluded from every average (a failed call is never
    scored as a zero) rather than pulling the aggregate down. If every case errored,
    composite/code_avg/model_avg are None — there is nothing to average.
    """
    scorable = [c for c in cases if c.status == "done"]
    error_count = len(cases) - len(scorable)
    human_count = sum(1 for c in scorable if c.human_score is not None)

    if not scorable:
        return RunStats(
            composite=None, code_avg=None, model_avg=None,
            human_count=human_count, case_count=len(cases), error_count=error_count,
        )

    blended = [
        blend_case(c.code_score or 0.0, c.model_score or 0.0, c.human_score, weights)
        for c in scorable
    ]
    return RunStats(
        composite=round(sum(blended) / len(blended), 2),
        code_avg=round(sum(c.code_score or 0.0 for c in scorable) / len(scorable), 1),
        model_avg=round(sum(c.model_score or 0.0 for c in scorable) / len(scorable), 1),
        human_count=human_count,
        case_count=len(cases),
        error_count=error_count,
    )
