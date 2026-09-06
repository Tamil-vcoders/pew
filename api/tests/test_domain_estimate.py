import pytest

from app.domain.estimate import (
    TOK,
    build_estimate,
    call_cost,
    cycle_estimate_rows,
    run_estimate_rows,
)
from app.domain.models import ModelRates

RATES = {
    "gemini-2.5-pro": ModelRates(label="Gemini 2.5 Pro", rate_in_per_1m=1.25, rate_out_per_1m=10.00, enabled=True),
    "gemini-2.5-flash": ModelRates(label="Gemini 2.5 Flash", rate_in_per_1m=0.30, rate_out_per_1m=2.50, enabled=True),
}
MODELS = {"execution": "gemini-2.5-pro", "grading": "gemini-2.5-flash", "suggestions": "gemini-2.5-flash", "datasetGen": "gemini-2.5-flash"}


def test_call_cost_is_linear_in_tokens_per_million():
    assert call_cost(rate_in_per_1m=1.0, rate_out_per_1m=2.0, tin=1_000_000, tout=1_000_000) == 3.0


def test_call_cost_of_zero_tokens_is_zero():
    assert call_cost(1.25, 10.0, 0, 0) == 0.0


def test_run_estimate_rows_uses_tok_constants_scaled_by_case_count():
    rows = run_estimate_rows(MODELS, n_cases=5)
    assert rows == [
        ("Execution", "gemini-2.5-pro", TOK["exec"]["in"] * 5, TOK["exec"]["out"] * 5),
        ("Model grading", "gemini-2.5-flash", TOK["grade"]["in"] * 5, TOK["grade"]["out"] * 5),
    ]


def test_run_estimate_rows_accepts_a_refined_execution_input_token_count():
    rows = run_estimate_rows(MODELS, n_cases=2, exec_tokens_in=123)
    assert rows[0] == ("Execution", "gemini-2.5-pro", 123, TOK["exec"]["out"] * 2)


def test_run_estimate_rows_for_zero_cases_is_all_zero_tokens():
    rows = run_estimate_rows(MODELS, n_cases=0)
    assert rows == [
        ("Execution", "gemini-2.5-pro", 0, 0),
        ("Model grading", "gemini-2.5-flash", 0, 0),
    ]


def test_build_estimate_totals_sum_every_row():
    est = build_estimate(run_estimate_rows(MODELS, n_cases=3), RATES)
    assert len(est.rows) == 2
    assert est.total_in == sum(r.tokens_in for r in est.rows)
    assert est.total_out == sum(r.tokens_out for r in est.rows)
    assert est.total_cost == sum(r.cost for r in est.rows)
    assert est.total_cost > 0


def test_build_estimate_scales_roughly_linearly_with_case_count():
    est_1 = build_estimate(run_estimate_rows(MODELS, n_cases=1), RATES)
    est_10 = build_estimate(run_estimate_rows(MODELS, n_cases=10), RATES)
    assert est_10.total_cost == pytest.approx(est_1.total_cost * 10)


def test_cycle_estimate_rows_adds_a_suggestions_row_scaled_by_n_sug():
    rows = cycle_estimate_rows(MODELS, n_cases=5, n_sug=3)
    assert rows == [
        ("Execution", "gemini-2.5-pro", TOK["exec"]["in"] * 5, TOK["exec"]["out"] * 5),
        ("Model grading", "gemini-2.5-flash", TOK["grade"]["in"] * 5, TOK["grade"]["out"] * 5),
        ("Suggestions", "gemini-2.5-flash", TOK["suggest"]["in"] * 3, TOK["suggest"]["out"] * 3),
    ]


def test_cycle_estimate_rows_suggestions_row_ignores_case_count():
    rows_few_cases = cycle_estimate_rows(MODELS, n_cases=1, n_sug=2)
    rows_many_cases = cycle_estimate_rows(MODELS, n_cases=20, n_sug=2)
    assert rows_few_cases[2][2:] == rows_many_cases[2][2:]
