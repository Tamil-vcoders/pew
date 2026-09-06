"""Improvement-cycle state machine — devspec §3 ("Cloud Run is stateless — the machine's
current state is persisted in the cycles/{id} document") and Appendix B.

Pure Python: zero google.*/firebase_admin imports. Every domain model here is a frozen
dataclass, so — unlike Appendix B's mutate-in-place pseudocode — every transition takes an
immutable Cycle and returns a new one via dataclasses.replace. Field names, check ordering,
and thresholds otherwise follow Appendix B and docs/prototype.jsx's cycle functions verbatim.

Services orchestrate around these functions (loading/saving the cycle doc, calling the LLM,
scheduling background work); routes translate ValueError into HTTP 409. No I/O happens here.
"""
from __future__ import annotations

from dataclasses import replace

from app.domain.models import (
    Cycle,
    CycleConfigSnapshot,
    CycleEndReason,
    CyclePending,
    CycleScore,
    CycleStage,
)
from app.domain.suggestions import Suggestion

END: frozenset[CycleEndReason] = frozenset(
    {"target-met", "iteration-cap", "budget-cap", "user-stopped", "no-suggestions", "not-converging"}
)


def start(*, cycle_id: str, prompt_id: str, project_id: str, config: CycleConfigSnapshot, started_by: str) -> Cycle:
    """Pure constructor. Never validates one-active-cycle — that's the repo's transactional
    job (a Firestore precondition), not a domain concern."""
    return Cycle(
        id=cycle_id,
        prompt_id=prompt_id,
        project_id=project_id,
        status="active",
        stage="dataset",
        iteration=0,
        spent=0.0,
        scores=[],
        end_reason=None,
        best_n=None,
        warned_flat=False,
        current_version_n=None,
        current_run_id=None,
        pending=None,
        config=config,
        log=[],
        started_by=started_by,
    )


def can_start_iteration(cycle: Cycle, est_cost: float) -> tuple[bool, CycleEndReason | None]:
    """AC-9.5: projected cost of the next iteration is checked against remaining budget
    BEFORE any spend. Verbatim devspec Appendix B."""
    if cycle.spent + est_cost > cycle.config.budget:
        return False, "budget-cap"
    return True, None


def approve_dataset(cycle: Cycle) -> Cycle:
    _require_stage(cycle, "dataset")
    return replace(cycle, stage="preview")


def begin_iteration(cycle: Cycle, *, run_id: str) -> Cycle:
    """Caller must already have called can_start_iteration and gotten (True, None) — this
    function does not re-check budget, so a caller bug (not this function) would be
    responsible for starting an iteration over budget."""
    _require_stage(cycle, "preview")
    return replace(cycle, iteration=cycle.iteration + 1, stage="running", current_run_id=run_id)


def mark_running_complete(cycle: Cycle, *, cost_actual: float, version_n: int) -> Cycle:
    """current_run_id is deliberately retained (not cleared) here — the service layer needs
    it to re-read the just-finalized run's stats when the attended-mode "continue to checks"
    transition fires from "grading". The next begin_iteration() call overwrites it with the
    new run's id, which is the only point it should ever change."""
    _require_stage(cycle, "running")
    next_stage: CycleStage = "checking" if cycle.config.auto else "grading"
    return replace(cycle, spent=cycle.spent + cost_actual, current_version_n=version_n, stage=next_stage)


def after_score(cycle: Cycle, composite: float) -> tuple[Cycle, str]:
    """Appendix B's after_score, verbatim logic. Valid from either pause the run can land
    in depending on mode ("grading" for attended, "checking" for auto — mark_running_complete
    picks which). Returns (new_cycle, decision):
      "end:target-met" | "end:iteration-cap" | "end:not-converging" | "warn:flat" | "suggest"
    The "warn:flat" branch sets warned_flat=True and stays in "checking" (a persisted pause —
    see domain/cycle.py's module docstring and devspec Appendix B's AC-F.11 note)."""
    if cycle.stage not in ("grading", "checking"):
        raise ValueError(f"Cannot score a cycle at stage {cycle.stage!r}")
    if cycle.current_version_n is None:
        raise ValueError("Cannot score a cycle with no current_version_n")

    scores = [*cycle.scores, CycleScore(n=cycle.current_version_n, score=composite)]
    scored = replace(cycle, scores=scores, stage="checking")

    if composite >= scored.config.target:
        return scored, "end:target-met"
    if scored.iteration >= scored.config.max_iter:
        return scored, "end:iteration-cap"
    if len(scores) >= 2 and scores[-1].score <= scores[-2].score and not scored.warned_flat:
        if scored.config.auto:
            return scored, "end:not-converging"
        return replace(scored, warned_flat=True), "warn:flat"
    return scored, "suggest"


def propose_suggestions(cycle: Cycle, *, candidates: list[Suggestion], cost: float) -> tuple[Cycle, str]:
    _require_stage(cycle, "checking")
    if not candidates:
        return cycle, "end:no-suggestions"
    proposed = replace(
        cycle,
        spent=cycle.spent + cost,
        stage="suggesting",
        pending=CyclePending(candidates=candidates, selected=0),
    )
    return proposed, "suggested"


def apply_candidate(cycle: Cycle, *, index: int, version_n: int) -> Cycle:
    """Building the actual new prompt Version is a service/adapter concern (VersionRepo.create)
    — domain just records which version number is now current for the next iteration."""
    _require_stage(cycle, "suggesting")
    if cycle.pending is None:
        raise ValueError("No pending suggestions to apply")
    if not (0 <= index < len(cycle.pending.candidates)):
        raise ValueError(f"Candidate index {index} out of range")
    return replace(cycle, pending=None, stage="preview", current_version_n=version_n)


def end(cycle: Cycle, reason: CycleEndReason) -> Cycle:
    """AC-9.4: best_n identifies the best-scoring version across ALL iterations, not just
    the most recent — matches the prototype's `x.bestN ?? bestOfScores` fallback exactly."""
    if cycle.status != "active":
        raise ValueError("Cannot end a cycle that is not active")
    best_n = cycle.best_n
    if best_n is None and cycle.scores:
        best_n = max(cycle.scores, key=lambda s: s.score).n
    return replace(
        cycle, status="ended", stage="ended", end_reason=reason, best_n=best_n, pending=None
    )


def stop(cycle: Cycle) -> Cycle:
    """Idempotent — matches the prototype's `if (cycleRef.current?.status === "active")
    endCycle(...)` guard: stopping an already-ended cycle is a no-op, not an error."""
    if cycle.status != "active":
        return cycle
    return end(cycle, "user-stopped")


def _require_stage(cycle: Cycle, stage: str) -> None:
    if cycle.stage != stage:
        raise ValueError(f"Expected stage {stage!r}, got {cycle.stage!r}")
