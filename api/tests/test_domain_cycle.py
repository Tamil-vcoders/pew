"""Unit tests for the cycle state machine (api/app/domain/cycle.py).

Every test asserts a specific PRD acceptance criterion or devspec Appendix B behavior —
see the comment on each test naming which one. No emulator, no LLM: domain/cycle.py is
pure Python operating on frozen dataclasses.
"""
from __future__ import annotations

import pytest

from app.domain import cycle as cyc
from app.domain.models import CycleConfigSnapshot, CyclePending
from app.domain.suggestions import Suggestion


def _config(**overrides: object) -> CycleConfigSnapshot:
    base: dict[str, object] = {
        "target": 8.0,
        "max_iter": 4,
        "budget": 0.6,
        "n_sug": 2,
        "auto": False,
        "weights": {"code": 1.0, "model": 1.0, "human": 1.0},
        "models": {"execution": "m-exec", "grading": "m-grade", "suggestions": "m-sug", "datasetGen": "m-ds"},
    }
    base.update(overrides)
    return CycleConfigSnapshot(**base)  # type: ignore[arg-type]


def _started(**config_overrides: object) -> cyc.Cycle:
    return cyc.start(
        cycle_id="c1", prompt_id="p1", project_id="j1",
        config=_config(**config_overrides), started_by="u1",
    )


def _suggestion(rule_id: str = "clear") -> Suggestion:
    return Suggestion(rule_id=rule_id, technique="Clear and direct", evidence="hedging", old_text="a", new_text="b")


# ---------- start ----------

def test_start_produces_a_fresh_cycle_at_dataset_stage():
    c = _started()
    assert c.status == "active"
    assert c.stage == "dataset"
    assert c.iteration == 0
    assert c.spent == 0.0
    assert c.scores == []
    assert c.end_reason is None
    assert c.best_n is None
    assert c.warned_flat is False
    assert c.current_version_n is None
    assert c.current_run_id is None
    assert c.pending is None
    assert c.log == []


# ---------- can_start_iteration (AC-9.5) ----------

def test_can_start_iteration_blocks_before_any_spend_when_projection_exceeds_budget():
    c = cyc.start(cycle_id="c1", prompt_id="p1", project_id="j1",
                   config=_config(budget=0.6), started_by="u1")
    c = _with(c, spent=0.5)
    ok, reason = cyc.can_start_iteration(c, est_cost=0.2)
    assert (ok, reason) == (False, "budget-cap")
    # can_start_iteration must not mutate — it only decides
    assert c.spent == 0.5


def test_can_start_iteration_allows_when_projection_fits_remaining_budget():
    c = _with(_started(budget=0.6), spent=0.1)
    ok, reason = cyc.can_start_iteration(c, est_cost=0.2)
    assert (ok, reason) == (True, None)


def test_can_start_iteration_allows_when_projection_exactly_matches_remaining_budget():
    # 0.5 + 0.5 is exact in binary floating point, unlike e.g. 0.4 + 0.2 — this test wants
    # to hit the boundary precisely, not stumble into float-precision noise.
    c = _with(_started(budget=1.0), spent=0.5)
    ok, reason = cyc.can_start_iteration(c, est_cost=0.5)
    assert (ok, reason) == (True, None)


# ---------- approve_dataset / begin_iteration / mark_running_complete ----------

def test_approve_dataset_moves_from_dataset_to_preview():
    c = cyc.approve_dataset(_started())
    assert c.stage == "preview"


def test_approve_dataset_rejects_wrong_stage():
    c = _with(_started(), stage="preview")
    with pytest.raises(ValueError):
        cyc.approve_dataset(c)


def test_begin_iteration_increments_iteration_and_records_run_id():
    c = _with(_started(), stage="preview")
    c = cyc.begin_iteration(c, run_id="run1")
    assert c.iteration == 1
    assert c.stage == "running"
    assert c.current_run_id == "run1"


def test_begin_iteration_rejects_wrong_stage():
    with pytest.raises(ValueError):
        cyc.begin_iteration(_started(), run_id="run1")  # still at "dataset"


def test_mark_running_complete_attended_mode_pauses_at_grading():
    c = _with(_started(auto=False), stage="running", current_run_id="run1")
    c = cyc.mark_running_complete(c, cost_actual=0.05, version_n=2)
    assert c.stage == "grading"
    assert c.spent == pytest.approx(0.05)
    assert c.current_version_n == 2
    # current_run_id is retained (not cleared) through the grading pause — the service
    # layer needs it to re-read the just-finalized run's stats when the user continues.
    assert c.current_run_id == "run1"


def test_mark_running_complete_auto_mode_skips_straight_to_checking():
    c = _with(_started(auto=True), stage="running", current_run_id="run1")
    c = cyc.mark_running_complete(c, cost_actual=0.05, version_n=2)
    assert c.stage == "checking"


def test_mark_running_complete_accumulates_spend_across_iterations():
    c = _with(_started(), stage="running", spent=0.2, current_run_id="run1")
    c = cyc.mark_running_complete(c, cost_actual=0.05, version_n=2)
    assert c.spent == pytest.approx(0.25)


def test_mark_running_complete_rejects_wrong_stage():
    with pytest.raises(ValueError):
        cyc.mark_running_complete(_started(), cost_actual=0.05, version_n=2)  # at "dataset"


# ---------- after_score (AC-9.3, AC-9.4, AC-F.11, Appendix B) ----------

def test_after_score_ends_target_met_when_composite_reaches_target():
    c = _with(_started(target=8.0), stage="checking", current_version_n=3)
    new_c, decision = cyc.after_score(c, composite=8.5)
    assert decision == "end:target-met"
    assert new_c.scores == [cyc.CycleScore(n=3, score=8.5)]
    # after_score itself never sets end_reason/status — that's end()'s job
    assert new_c.status == "active"
    assert new_c.end_reason is None


def test_after_score_ends_iteration_cap_when_cap_reached_without_target():
    c = _with(_started(target=8.0, max_iter=2), stage="checking", iteration=2, current_version_n=3)
    _, decision = cyc.after_score(c, composite=5.0)
    assert decision == "end:iteration-cap"


def test_after_score_target_met_takes_priority_over_iteration_cap():
    c = _with(_started(target=8.0, max_iter=1), stage="checking", iteration=1, current_version_n=3)
    _, decision = cyc.after_score(c, composite=9.0)
    assert decision == "end:target-met"


def test_after_score_flat_attended_mode_warns_once_and_stays_in_checking():
    c = _with(
        _started(target=8.0, max_iter=10, auto=False),
        stage="checking", iteration=1, current_version_n=2,
        scores=[cyc.CycleScore(n=1, score=6.0)],
    )
    new_c, decision = cyc.after_score(c, composite=6.0)  # flat: 6.0 <= 6.0
    assert decision == "warn:flat"
    assert new_c.warned_flat is True
    assert new_c.stage == "checking"


def test_after_score_flat_auto_mode_ends_not_converging():
    c = _with(
        _started(target=8.0, max_iter=10, auto=True),
        stage="checking", iteration=1, current_version_n=2,
        scores=[cyc.CycleScore(n=1, score=6.0)],
    )
    _, decision = cyc.after_score(c, composite=6.0)
    assert decision == "end:not-converging"


def test_after_score_does_not_rewarn_flat_once_already_warned():
    # Simulates: first iteration warned + user continued anyway; a later iteration is
    # flat again — AC-F.11 says the warning fires once, so this must proceed to "suggest".
    c = _with(
        _started(target=8.0, max_iter=10, auto=False),
        stage="checking", iteration=2, current_version_n=3, warned_flat=True,
        scores=[cyc.CycleScore(n=1, score=6.0), cyc.CycleScore(n=2, score=6.0)],
    )
    _, decision = cyc.after_score(c, composite=6.0)
    assert decision == "suggest"


def test_after_score_improving_score_proceeds_to_suggest():
    c = _with(
        _started(target=8.0, max_iter=10),
        stage="checking", iteration=1, current_version_n=2,
        scores=[cyc.CycleScore(n=1, score=4.0)],
    )
    _, decision = cyc.after_score(c, composite=6.0)
    assert decision == "suggest"


def test_after_score_first_iteration_with_no_prior_score_proceeds_to_suggest():
    c = _with(_started(target=8.0, max_iter=10), stage="checking", iteration=1, current_version_n=1)
    _, decision = cyc.after_score(c, composite=3.0)
    assert decision == "suggest"


def test_after_score_rejects_when_current_version_n_missing():
    c = _with(_started(), stage="checking", current_version_n=None)
    with pytest.raises(ValueError):
        cyc.after_score(c, composite=5.0)


def test_after_score_rejects_wrong_stage():
    c = _with(_started(), stage="preview", current_version_n=1)
    with pytest.raises(ValueError):
        cyc.after_score(c, composite=5.0)


# ---------- propose_suggestions ----------

def test_propose_suggestions_with_candidates_moves_to_suggesting():
    c = _with(_started(), stage="checking")
    candidates = [_suggestion("clear"), _suggestion("xml")]
    new_c, decision = cyc.propose_suggestions(c, candidates=candidates, cost=0.01)
    assert decision == "suggested"
    assert new_c.stage == "suggesting"
    assert new_c.pending == CyclePending(candidates=candidates, selected=0)
    assert new_c.spent == pytest.approx(0.01)


def test_propose_suggestions_with_no_candidates_ends_no_suggestions():
    c = _with(_started(), stage="checking")
    new_c, decision = cyc.propose_suggestions(c, candidates=[], cost=0.0)
    assert decision == "end:no-suggestions"
    assert new_c.pending is None


def test_propose_suggestions_rejects_wrong_stage():
    with pytest.raises(ValueError):
        cyc.propose_suggestions(_started(), candidates=[], cost=0.0)  # at "dataset"


# ---------- apply_candidate ----------

def test_apply_candidate_clears_pending_and_resets_to_preview():
    candidates = [_suggestion("clear"), _suggestion("xml")]
    c = _with(_started(), stage="suggesting", pending=CyclePending(candidates=candidates, selected=0))
    new_c = cyc.apply_candidate(c, index=1, version_n=5)
    assert new_c.pending is None
    assert new_c.stage == "preview"
    assert new_c.current_version_n == 5


def test_apply_candidate_rejects_out_of_range_index():
    candidates = [_suggestion("clear")]
    c = _with(_started(), stage="suggesting", pending=CyclePending(candidates=candidates, selected=0))
    with pytest.raises(ValueError):
        cyc.apply_candidate(c, index=5, version_n=2)


def test_apply_candidate_rejects_when_nothing_pending():
    c = _with(_started(), stage="suggesting", pending=None)
    with pytest.raises(ValueError):
        cyc.apply_candidate(c, index=0, version_n=2)


# ---------- end (AC-9.4: best across ALL iterations, AC-F.12: scores retained) ----------

def test_end_picks_the_best_score_across_all_iterations_not_just_the_last():
    c = _with(
        _started(),
        scores=[
            cyc.CycleScore(n=1, score=4.0),
            cyc.CycleScore(n=2, score=9.0),  # best, but not the last
            cyc.CycleScore(n=3, score=7.0),
        ],
    )
    ended = cyc.end(c, "iteration-cap")
    assert ended.best_n == 2
    assert ended.status == "ended"
    assert ended.stage == "ended"
    assert ended.end_reason == "iteration-cap"
    assert ended.pending is None


def test_end_retains_the_full_scores_list_untouched():
    scores = [cyc.CycleScore(n=1, score=4.0), cyc.CycleScore(n=2, score=5.0)]
    c = _with(_started(), scores=scores)
    ended = cyc.end(c, "budget-cap")
    assert ended.scores == scores


def test_end_prefers_an_already_set_best_n_over_recomputing():
    c = _with(_started(), scores=[cyc.CycleScore(n=1, score=9.0)], best_n=1)
    ended = cyc.end(c, "target-met")
    assert ended.best_n == 1


def test_end_with_no_scores_at_all_leaves_best_n_none():
    ended = cyc.end(_started(), "no-suggestions")
    assert ended.best_n is None


def test_end_rejects_an_already_ended_cycle():
    ended_once = cyc.end(_started(), "user-stopped")
    with pytest.raises(ValueError):
        cyc.end(ended_once, "user-stopped")


# ---------- stop (idempotent, matches prototype's stopCycle guard) ----------

def test_stop_ends_an_active_cycle_as_user_stopped():
    stopped = cyc.stop(_started())
    assert stopped.status == "ended"
    assert stopped.end_reason == "user-stopped"


def test_stop_is_a_no_op_on_an_already_ended_cycle():
    ended = cyc.end(_started(), "target-met")
    stopped_again = cyc.stop(ended)
    assert stopped_again == ended


# ---------- END constant ----------

def test_end_constant_contains_exactly_the_six_devspec_reasons():
    assert cyc.END == frozenset({
        "target-met", "iteration-cap", "budget-cap", "user-stopped", "no-suggestions", "not-converging",
    })


# ---------- helper ----------

def _with(c: cyc.Cycle, **overrides: object) -> cyc.Cycle:
    """dataclasses.replace shorthand for building test fixtures in a given intermediate state."""
    import dataclasses
    return dataclasses.replace(c, **overrides)
