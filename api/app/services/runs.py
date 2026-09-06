"""Evaluation run execution — devspec §6.3: bounded concurrency, per-case streaming
writes, transactional finalize."""
from __future__ import annotations

import asyncio

from app.domain.models import Case, CaseResult, ModelRates, RunStats
from app.domain.rendering import render
from app.domain.scoring import blend_run, code_grade
from app.ports.llm import LLMCallError, LLMProvider
from app.ports.repos import RunRepo

MAX_CONCURRENCY = 3  # PRD AC-3.3: concurrent in-flight model calls default to 3


async def execute_run(
    *,
    project_id: str,
    prompt_id: str,
    run_id: str,
    prompt_text: str,
    cases: list[Case],
    models: dict[str, str],
    weights: dict[str, float],
    rates: dict[str, ModelRates],
    llm: LLMProvider,
    runs: RunRepo,
) -> tuple[RunStats, float]:
    sem = asyncio.Semaphore(MAX_CONCURRENCY)

    async def one(idx: int, case: Case) -> CaseResult:
        async with sem:
            try:
                output, tin, tout = await llm.execute(render(prompt_text, case.input), models["execution"])
                verdict = await llm.grade(prompt_text, output, case.expected, models["grading"])
                result = CaseResult(
                    index=idx, case_id=case.id, output=output,
                    code_score=code_grade(output, case.expected), model_score=verdict.score,
                    human_score=None, weakness=verdict.weakness, reasoning=verdict.reasoning,
                    tokens_in=tin, tokens_out=tout, status="done", error=None,
                )
            except LLMCallError as exc:
                result = CaseResult(
                    index=idx, case_id=case.id, output=None, code_score=None, model_score=None,
                    human_score=None, weakness=None, reasoning=None, tokens_in=0, tokens_out=0,
                    status="error", error=str(exc),
                )
            await runs.write_case(project_id, prompt_id, run_id, result)
            return result

    results = await asyncio.gather(*(one(i, c) for i, c in enumerate(cases)))
    stats = blend_run(results, weights)
    # CaseResult carries one tokensIn/tokensOut pair per case, from the execute() call only —
    # LLMProvider.grade() (devspec §6.2) returns a GraderVerdict with no usage data, so actual
    # grading spend isn't tracked per case here; costActual reflects execution-call tokens.
    exec_rate = rates[models["execution"]]
    cost_actual = sum(
        (r.tokens_in / 1_000_000) * exec_rate.rate_in_per_1m
        + (r.tokens_out / 1_000_000) * exec_rate.rate_out_per_1m
        for r in results
        if r.status == "done"
    )
    await runs.finalize(project_id, prompt_id, run_id, stats=stats, cost_actual=cost_actual)
    return stats, cost_actual
