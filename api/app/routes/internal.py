# api/app/routes/internal.py
from __future__ import annotations

from typing import cast

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel, Field

from app.deps import (
    build_task_queue,
    get_cycle_repo,
    get_dataset_repo,
    get_llm_provider,
    get_model_registry_repo,
    get_prompt_repo,
    get_run_repo,
    get_version_repo,
    verify_internal_oidc,
)
from app.ports.llm import LLMProvider
from app.ports.repos import (
    CycleRepo,
    DatasetRepo,
    ModelRegistryRepo,
    PromptRepo,
    RunRepo,
    VersionRepo,
)
from app.ports.tasks import TaskQueue
from app.services.cycles import CycleDeps, run_iteration_task

router = APIRouter(prefix="/internal", tags=["internal"])


class RunIterationBody(BaseModel):
    cycle_id: str = Field(min_length=1, alias="cycleId")
    iteration: int = Field(ge=1)

    model_config = {"populate_by_name": True}


def _deps(
    background_tasks: BackgroundTasks,
    cycles: CycleRepo = Depends(get_cycle_repo),
    prompts: PromptRepo = Depends(get_prompt_repo),
    versions: VersionRepo = Depends(get_version_repo),
    dataset: DatasetRepo = Depends(get_dataset_repo),
    runs: RunRepo = Depends(get_run_repo),
    registry: ModelRegistryRepo = Depends(get_model_registry_repo),
    llm: LLMProvider = Depends(get_llm_provider),
) -> CycleDeps:
    # Two-step construction (see deps.py::build_task_queue's docstring): InlineTaskQueue needs
    # a reference to this very CycleDeps, so it can't be built before the dataclass exists.
    deps = CycleDeps(
        cycles=cycles, prompts=prompts, versions=versions, dataset=dataset,
        runs=runs, registry=registry, llm=llm, background_tasks=background_tasks,
        tasks=cast(TaskQueue, None),
    )
    deps.tasks = build_task_queue(background_tasks, deps)
    return deps


@router.post("/iterations", dependencies=[Depends(verify_internal_oidc)])
async def run_iteration(body: RunIterationBody, deps: CycleDeps = Depends(_deps)) -> dict[str, str]:
    # Awaited synchronously (not backgrounded): a raised exception becomes a 5xx so Cloud
    # Tasks retries per its own backoff. Safe because run_iteration_task is idempotent.
    await run_iteration_task(cycle_id=body.cycle_id, iteration=body.iteration, deps=deps)
    return {"status": "ok"}
