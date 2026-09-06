from app.domain.models import CaseResult
from app.domain.scoring import blend_case, blend_run, code_grade

EQUAL_WEIGHTS = {"code": 1.0, "model": 1.0, "human": 1.0}


def _done(case_id: str, code: float, model: float, human: float | None = None) -> CaseResult:
    return CaseResult(
        index=0, case_id=case_id, output="x", code_score=code, model_score=model,
        human_score=human, weakness=None, reasoning="r", tokens_in=1, tokens_out=1, status="done",
    )


def _error(case_id: str) -> CaseResult:
    return CaseResult(
        index=0, case_id=case_id, output=None, code_score=None, model_score=None,
        human_score=None, weakness=None, reasoning=None, tokens_in=0, tokens_out=0,
        status="error", error="boom",
    )


def test_code_grade_scores_ten_when_expected_appears_in_output_case_insensitively():
    assert code_grade("The ticket is HIGH priority.", "high") == 10.0


def test_code_grade_scores_zero_when_expected_is_absent():
    assert code_grade("The ticket is low priority.", "high") == 0.0


def test_blend_case_averages_code_and_model_when_ungraded():
    assert blend_case(10.0, 6.0, None, EQUAL_WEIGHTS) == 8.0


def test_blend_case_includes_human_only_when_graded():
    assert blend_case(10.0, 6.0, 8.0, EQUAL_WEIGHTS) == 8.0


def test_blend_case_zero_weights_returns_zero_rather_than_dividing_by_zero():
    assert blend_case(10.0, 6.0, 8.0, {"code": 0, "model": 0, "human": 0}) == 0.0


def test_blend_run_with_no_grades_blends_code_and_model_only():
    stats = blend_run([_done("c1", 10.0, 6.0), _done("c2", 8.0, 8.0)], EQUAL_WEIGHTS)
    assert stats.human_count == 0
    assert stats.case_count == 2
    assert stats.error_count == 0
    assert stats.composite == 8.0


def test_blend_run_with_partial_grades_only_counts_graded_cases_as_human_graded():
    stats = blend_run(
        [_done("c1", 10.0, 6.0, human=8.0), _done("c2", 8.0, 8.0)], EQUAL_WEIGHTS
    )
    assert stats.human_count == 1
    assert stats.case_count == 2


def test_blend_run_excludes_error_cases_from_every_average_never_scoring_them_zero():
    stats = blend_run([_done("c1", 10.0, 10.0), _error("c2")], EQUAL_WEIGHTS)
    assert stats.case_count == 2
    assert stats.error_count == 1
    assert stats.composite == 10.0
    assert stats.code_avg == 10.0
    assert stats.model_avg == 10.0


def test_blend_run_with_every_case_errored_returns_none_composite_not_zero():
    stats = blend_run([_error("c1"), _error("c2")], EQUAL_WEIGHTS)
    assert stats.composite is None
    assert stats.code_avg is None
    assert stats.model_avg is None
    assert stats.case_count == 2
    assert stats.error_count == 2
