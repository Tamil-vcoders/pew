"""Pre-run cost-estimate arithmetic — ported from docs/prototype.jsx's TOK/callCost/
estimateIteration (lines 67-86). Pure Python: zero google.*/firebase_admin imports.

Token counts are approximate per-case constants from devspec §7.2 for every stage except
the execution stage's input, which callers refine with a real `count_tokens` result (the
LLM port) on the actual rendered prompts — see app/routes/runs.py's estimate endpoint.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.domain.models import ModelRates

TOK: dict[str, dict[str, int]] = {
    "exec": {"in": 1500, "out": 700},
    "grade": {"in": 2800, "out": 400},
    "suggest": {"in": 5000, "out": 1500},
    "datasetGen": {"in": 3000, "out": 250},
}


def call_cost(rate_in_per_1m: float, rate_out_per_1m: float, tin: int, tout: int) -> float:
    return (tin * rate_in_per_1m + tout * rate_out_per_1m) / 1_000_000


@dataclass(frozen=True)
class EstimateRow:
    stage: str
    model: str
    tokens_in: int
    tokens_out: int
    cost: float


@dataclass(frozen=True)
class Estimate:
    rows: list[EstimateRow]
    total_in: int
    total_out: int
    total_cost: float


def build_estimate(
    stage_rows: list[tuple[str, str, int, int]],
    rates: dict[str, ModelRates],
) -> Estimate:
    """Assemble an Estimate from (stage, model_id, tokens_in, tokens_out) tuples.

    Generic over which stages are included, so the same function serves the Phase-3
    2-row "Run once" estimate (Execution + Model grading) and a future Phase-4 iteration
    estimate that adds a Suggestions row — callers decide which stages to pass in.
    """
    rows = [
        EstimateRow(
            stage=stage,
            model=model_id,
            tokens_in=tin,
            tokens_out=tout,
            cost=call_cost(rates[model_id].rate_in_per_1m, rates[model_id].rate_out_per_1m, tin, tout),
        )
        for stage, model_id, tin, tout in stage_rows
    ]
    return Estimate(
        rows=rows,
        total_in=sum(r.tokens_in for r in rows),
        total_out=sum(r.tokens_out for r in rows),
        total_cost=sum(r.cost for r in rows),
    )


def run_estimate_rows(
    models: dict[str, str], n_cases: int, exec_tokens_in: int | None = None
) -> list[tuple[str, str, int, int]]:
    """Stage rows for a single "Run once" (Execution + Model grading only — no
    suggestions row, matching the prototype's manualPreview `e.rows.slice(0, 2)`)."""
    exec_in = exec_tokens_in if exec_tokens_in is not None else TOK["exec"]["in"] * n_cases
    return [
        ("Execution", models["execution"], exec_in, TOK["exec"]["out"] * n_cases),
        ("Model grading", models["grading"], TOK["grade"]["in"] * n_cases, TOK["grade"]["out"] * n_cases),
    ]


def cycle_estimate_rows(
    models: dict[str, str], n_cases: int, n_sug: int, exec_tokens_in: int | None = None
) -> list[tuple[str, str, int, int]]:
    """Stage rows for a cycle iteration's projected cost (Execution + Model grading +
    Suggestions), matching docs/prototype.jsx's estimateIteration. The Suggestions row
    scales with n_sug only — it is drafted once per candidate, not once per case."""
    return [
        *run_estimate_rows(models, n_cases, exec_tokens_in=exec_tokens_in),
        ("Suggestions", models["suggestions"], TOK["suggest"]["in"] * n_sug, TOK["suggest"]["out"] * n_sug),
    ]
