# api/tests/test_internal_iterations.py
"""Unit tests for services/cycles.py::run_iteration_task — the idempotent entry point both
TaskQueue adapters call. Hand-rolled fakes (no Firestore emulator), mirroring test_deps.py's
_FakeUserRepo convention.
"""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import BackgroundTasks

from app.adapters.fake_llm import FakeLLMProvider
from app.domain.models import (
    Case,
    Cycle,
    CycleConfigSnapshot,
    CycleScore,
    ModelRates,
    Run,
    Version,
)
from app.services.cycles import CycleDeps, run_iteration_task

_CONFIG = CycleConfigSnapshot(
    target=9.5, max_iter=4, budget=10.0, n_sug=2, auto=False,
    weights={"code": 1.0, "model": 1.0, "human": 1.0},
    models={"execution": "exec-model", "grading": "grade-model", "suggestions": "sug-model", "datasetGen": "gen-model"},
)


def _cycle(**overrides: object) -> Cycle:
    base: dict[str, object] = {
        "id": "cycle-1", "prompt_id": "prompt-1", "project_id": "project-1",
        "status": "active", "stage": "running", "iteration": 1, "spent": 0.0, "scores": [],
        "end_reason": None, "best_n": None, "warned_flat": False, "current_version_n": 1,
        "current_run_id": "run-1", "pending": None, "config": _CONFIG, "log": [], "started_by": "uid-1",
    }
    base.update(overrides)
    return Cycle(**base)  # type: ignore[arg-type]


class _FakeCycleRepo:
    def __init__(self, cycle: Cycle | None) -> None:
        self.cycle = cycle
        self.saved: list[Cycle] = []

    async def get_active(self) -> Cycle | None:
        return self.cycle

    async def get(self, cycle_id: str) -> Cycle | None:
        return self.cycle

    async def create(self, cycle: Cycle) -> Cycle:
        raise NotImplementedError

    async def save(self, cycle: Cycle, *, new_log_messages: object = ()) -> None:
        self.saved.append(cycle)
        self.cycle = cycle


class _FakeRunRepo:
    def __init__(self) -> None:
        self.finalized = False
        self.touched = False

    async def get(self, project_id: str, prompt_id: str, run_id: str) -> Run | None:
        self.touched = True
        return Run(
            id=run_id, version_n=1, status="running", composite=None, code_avg=None,
            model_avg=None, cost_estimate=None, cost_actual=None, started_by="uid-1",
            started_at=datetime.now(UTC),
        )

    async def create_run(self, project_id: str, prompt_id: str, *, version_n: int, started_by: str) -> str:
        raise NotImplementedError

    async def write_case(self, project_id: str, prompt_id: str, run_id: str, result: object) -> None:
        self.touched = True

    async def finalize(self, project_id: str, prompt_id: str, run_id: str, *, stats: object, cost_actual: float) -> None:
        self.finalized = True

    async def set_human_grade(self, project_id: str, prompt_id: str, run_id: str, case_id: str, score: float | None) -> None:
        raise NotImplementedError


class _FakeVersionRepo:
    def __init__(self) -> None:
        self.touched = False

    async def create(self, *args: object, **kwargs: object) -> Version:
        raise NotImplementedError

    async def get(self, project_id: str, prompt_id: str, n: int) -> Version | None:
        self.touched = True
        return Version(n=n, text="Do the thing well.", note=None, technique=None, created_by="uid-1", created_at=None)


class _FakeDatasetRepo:
    def __init__(self) -> None:
        self.touched = False

    async def list_by_prompt(self, project_id: str, prompt_id: str) -> list[Case]:
        self.touched = True
        return [Case(id="case-1", input="hi", expected="hi back", order=0, source="manual")]

    async def create_case(self, *args: object, **kwargs: object) -> Case:
        raise NotImplementedError

    async def bulk_create(self, *args: object, **kwargs: object) -> list[Case]:
        raise NotImplementedError

    async def update_case(self, *args: object, **kwargs: object) -> Case:
        raise NotImplementedError

    async def delete_case(self, *args: object, **kwargs: object) -> None:
        raise NotImplementedError


class _FakePromptRepo:
    async def get(self, project_id: str, prompt_id: str) -> None:
        raise NotImplementedError

    async def list_by_project(self, project_id: str) -> None:
        raise NotImplementedError

    async def create(self, *args: object, **kwargs: object) -> None:
        raise NotImplementedError

    async def update(self, *args: object, **kwargs: object) -> None:
        raise NotImplementedError


class _FakeRegistryRepo:
    async def get_all(self) -> dict[str, ModelRates]:
        return {
            "exec-model": ModelRates(label="Exec", rate_in_per_1m=1.0, rate_out_per_1m=1.0, enabled=True),
            "grade-model": ModelRates(label="Grade", rate_in_per_1m=1.0, rate_out_per_1m=1.0, enabled=True),
        }

    async def update(self, *args: object, **kwargs: object) -> ModelRates:
        raise NotImplementedError


def _build_deps(cycle: Cycle | None) -> tuple[CycleDeps, _FakeCycleRepo, _FakeRunRepo, _FakeVersionRepo, _FakeDatasetRepo]:
    cycles = _FakeCycleRepo(cycle)
    runs = _FakeRunRepo()
    versions = _FakeVersionRepo()
    dataset = _FakeDatasetRepo()
    deps = CycleDeps(
        cycles=cycles, prompts=_FakePromptRepo(), versions=versions,
        dataset=dataset, runs=runs, registry=_FakeRegistryRepo(),
        llm=FakeLLMProvider(), background_tasks=BackgroundTasks(),
        tasks=None,  # type: ignore[arg-type]  # never used — run_iteration_task doesn't enqueue
    )
    return deps, cycles, runs, versions, dataset


async def test_no_op_when_iteration_already_recorded_in_scores() -> None:
    cycle = _cycle(scores=[CycleScore(n=1, score=8.0)])
    deps, cycles, runs, versions, dataset = _build_deps(cycle)

    await run_iteration_task(cycle_id="cycle-1", iteration=1, deps=deps)

    assert cycles.saved == []
    assert runs.touched is False
    assert versions.touched is False
    assert dataset.touched is False


async def test_no_op_when_cycle_is_no_longer_active() -> None:
    cycle = _cycle(status="ended", stage="ended")
    deps, cycles, runs, versions, dataset = _build_deps(cycle)

    await run_iteration_task(cycle_id="cycle-1", iteration=1, deps=deps)

    assert cycles.saved == []
    assert runs.touched is False
    assert versions.touched is False
    assert dataset.touched is False


async def test_no_op_when_cycle_is_missing() -> None:
    deps, cycles, runs, _versions, _dataset = _build_deps(None)

    await run_iteration_task(cycle_id="cycle-1", iteration=1, deps=deps)

    assert cycles.saved == []
    assert runs.touched is False


async def test_executes_and_advances_on_first_delivery() -> None:
    cycle = _cycle()
    deps, cycles, runs, _versions, _dataset = _build_deps(cycle)

    await run_iteration_task(cycle_id="cycle-1", iteration=1, deps=deps)

    assert runs.finalized is True
    assert cycles.saved  # the cycle advanced past "running"
    assert cycles.saved[-1].stage != "running"
