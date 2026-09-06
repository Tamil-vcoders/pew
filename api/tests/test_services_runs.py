"""Unit tests for services/runs.py::execute_run, using FakeLLMProvider and an in-memory
fake RunRepo — no Firestore emulator needed for this pure orchestration logic."""
from __future__ import annotations

from app.adapters.fake_llm import FakeLLMProvider
from app.domain.models import Case, CaseResult, ModelRates, Run, RunStats
from app.services.runs import execute_run
from tests.fakes import QUOTA_MARKER, ConcurrencyTrackingLLMProvider, FaultyFakeLLMProvider

RATES = {
    "exec-model": ModelRates(label="exec", rate_in_per_1m=1.0, rate_out_per_1m=2.0, enabled=True),
    "grade-model": ModelRates(label="grade", rate_in_per_1m=1.0, rate_out_per_1m=2.0, enabled=True),
}
MODELS = {"execution": "exec-model", "grading": "grade-model", "suggestions": "grade-model", "datasetGen": "grade-model"}
WEIGHTS = {"code": 1.0, "model": 1.0, "human": 1.0}


class _FakeRunRepo:
    def __init__(self) -> None:
        self.written: list[CaseResult] = []
        self.finalized: tuple[RunStats, float] | None = None

    async def get(self, project_id: str, prompt_id: str, run_id: str) -> Run | None:
        return None

    async def create_run(self, project_id: str, prompt_id: str, *, version_n: int, started_by: str) -> str:
        return "run1"

    async def write_case(self, project_id: str, prompt_id: str, run_id: str, result: CaseResult) -> None:
        self.written.append(result)

    async def finalize(self, project_id: str, prompt_id: str, run_id: str, *, stats: RunStats, cost_actual: float) -> None:
        self.finalized = (stats, cost_actual)

    async def set_human_grade(self, project_id: str, prompt_id: str, run_id: str, case_id: str, score: float | None) -> None:
        raise NotImplementedError


async def test_execute_run_returns_the_finalized_stats_and_actual_cost():
    cases = [Case(id="c1", input="hello", expected="hello", order=0, source="manual")]
    runs = _FakeRunRepo()

    stats, cost_actual = await execute_run(
        project_id="j1", prompt_id="p1", run_id="run1",
        prompt_text="echo {{input}}", cases=cases, models=MODELS, weights=WEIGHTS,
        rates=RATES, llm=FakeLLMProvider(), runs=runs,
    )

    assert runs.finalized is not None
    assert runs.finalized == (stats, cost_actual)
    assert stats.case_count == 1
    assert cost_actual >= 0.0


async def test_execute_run_short_circuits_remaining_cases_once_quota_is_exhausted():
    cases = [
        Case(
            id=f"c{i}",
            input=f"{QUOTA_MARKER} {i}" if i == 0 else f"hello {i}",
            expected="hello", order=i, source="manual",
        )
        for i in range(10)
    ]
    runs = _FakeRunRepo()

    stats, _ = await execute_run(
        project_id="j1", prompt_id="p1", run_id="run1",
        prompt_text="echo {{input}}", cases=cases, models=MODELS, weights=WEIGHTS,
        rates=RATES, llm=FaultyFakeLLMProvider(), runs=runs,
    )

    done = [r for r in runs.written if r.status == "done"]
    skipped = [r for r in runs.written if r.status == "error" and "skipped" in (r.error or "").lower()]
    assert len(done) >= 2, "cases racing concurrently with the quota failure should still complete normally"
    assert len(skipped) >= 1, "later cases should short-circuit instead of each burning 3 retries"
    assert stats.error_count >= 2  # case 0's own quota error, plus at least one short-circuited skip


async def test_execute_run_caps_concurrency_at_3_across_30_cases():
    cases = [
        Case(id=f"c{i}", input=f"hello {i}", expected="hello", order=i, source="manual")
        for i in range(30)
    ]
    runs = _FakeRunRepo()
    llm = ConcurrencyTrackingLLMProvider()

    stats, _ = await execute_run(
        project_id="j1", prompt_id="p1", run_id="run1",
        prompt_text="echo {{input}}", cases=cases, models=MODELS, weights=WEIGHTS,
        rates=RATES, llm=llm, runs=runs,
    )

    assert llm.peak_concurrency == 3
    assert stats.case_count == 30
    assert stats.error_count == 0
    assert len(runs.written) == 30
