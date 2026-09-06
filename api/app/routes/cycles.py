# api/app/routes/cycles.py
from typing import cast

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from app.deps import (
    build_task_queue,
    current_user,
    get_cycle_repo,
    get_dataset_repo,
    get_llm_provider,
    get_model_registry_repo,
    get_project_repo,
    get_prompt_repo,
    get_run_repo,
    get_version_repo,
    require,
)
from app.domain.models import Cycle, User
from app.ports.llm import LLMCallError, LLMProvider
from app.ports.repos import (
    CycleRepo,
    DatasetRepo,
    ModelRegistryRepo,
    ProjectRepo,
    PromptRepo,
    RunRepo,
    VersionRepo,
)
from app.ports.tasks import TaskQueue
from app.services.cycles import (
    CycleDeps,
    approve_dataset_action,
    confirm_iteration,
    continue_cycle,
    select_candidate,
    start_cycle,
    stop_cycle_action,
)

router = APIRouter(prefix="/cycles", tags=["cycles"])


class StartCycleBody(BaseModel):
    project_id: str = Field(min_length=1, alias="projectId")
    prompt_id: str = Field(min_length=1, alias="promptId")

    model_config = {"populate_by_name": True}


class ConfirmIterationBody(BaseModel):
    text: str = Field(min_length=1)


class SelectCandidateBody(BaseModel):
    index: int = Field(ge=0)
    override_text: str | None = Field(default=None, alias="overrideText")

    model_config = {"populate_by_name": True}


def _serialize(cycle: Cycle) -> dict[str, object]:
    return {
        "id": cycle.id,
        "promptId": cycle.prompt_id,
        "projectId": cycle.project_id,
        "status": cycle.status,
        "stage": cycle.stage,
        "iteration": cycle.iteration,
        "spent": cycle.spent,
        "scores": [{"n": s.n, "score": s.score} for s in cycle.scores],
        "endReason": cycle.end_reason,
        "bestN": cycle.best_n,
        "warnedFlat": cycle.warned_flat,
        "currentVersionN": cycle.current_version_n,
        "currentRunId": cycle.current_run_id,
        "pending": (
            {
                "candidates": [
                    {
                        "ruleId": c.rule_id,
                        "technique": c.technique,
                        "evidence": c.evidence,
                        "oldText": c.old_text,
                        "newText": c.new_text,
                    }
                    for c in cycle.pending.candidates
                ],
                "selected": cycle.pending.selected,
            }
            if cycle.pending is not None
            else None
        ),
        "configSnapshot": {
            "target": cycle.config.target,
            "maxIter": cycle.config.max_iter,
            "budget": cycle.config.budget,
            "nSug": cycle.config.n_sug,
            "auto": cycle.config.auto,
            "weights": cycle.config.weights,
            "models": cycle.config.models,
        },
        "log": [{"ts": entry.ts.isoformat(), "message": entry.message} for entry in cycle.log],
        "startedBy": cycle.started_by,
    }


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


@router.post("", status_code=201, dependencies=[Depends(require("contributor"))])
async def start(
    body: StartCycleBody,
    user: User = Depends(current_user),
    projects: ProjectRepo = Depends(get_project_repo),
    prompts: PromptRepo = Depends(get_prompt_repo),
    deps: CycleDeps = Depends(_deps),
) -> dict[str, object]:
    project = await projects.get(body.project_id)
    prompt = await prompts.get(body.project_id, body.prompt_id)
    if project is None or prompt is None:
        raise HTTPException(404, "Project or prompt not found")
    try:
        cycle = await start_cycle(project=project, prompt=prompt, user_uid=user.uid, user_name=user.name, deps=deps)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return _serialize(cycle)


@router.post("/{cycle_id}/approve-dataset", dependencies=[Depends(require("contributor"))])
async def approve_dataset(cycle_id: str, deps: CycleDeps = Depends(_deps)) -> dict[str, object]:
    try:
        cycle = await approve_dataset_action(cycle_id, deps=deps)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return _serialize(cycle)


@router.post("/{cycle_id}/confirm-iteration", dependencies=[Depends(require("contributor"))])
async def confirm(
    cycle_id: str,
    body: ConfirmIterationBody,
    user: User = Depends(current_user),
    deps: CycleDeps = Depends(_deps),
) -> dict[str, object]:
    try:
        cycle = await confirm_iteration(cycle_id, text=body.text, actor_uid=user.uid, deps=deps)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    except LLMCallError as exc:
        raise HTTPException(502, f"Model call failed: {exc}") from exc
    return _serialize(cycle)


@router.post("/{cycle_id}/continue", dependencies=[Depends(require("contributor"))])
async def cont(cycle_id: str, deps: CycleDeps = Depends(_deps)) -> dict[str, object]:
    try:
        cycle = await continue_cycle(cycle_id, deps=deps)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    except LLMCallError as exc:
        raise HTTPException(502, f"Model call failed: {exc}") from exc
    return _serialize(cycle)


@router.post("/{cycle_id}/select-candidate", dependencies=[Depends(require("contributor"))])
async def select(
    cycle_id: str,
    body: SelectCandidateBody,
    user: User = Depends(current_user),
    deps: CycleDeps = Depends(_deps),
) -> dict[str, object]:
    try:
        cycle = await select_candidate(
            cycle_id, index=body.index, override_text=body.override_text, actor_uid=user.uid, deps=deps
        )
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return _serialize(cycle)


@router.post("/{cycle_id}/stop", dependencies=[Depends(require("contributor"))])
async def stop(cycle_id: str, deps: CycleDeps = Depends(_deps)) -> dict[str, object]:
    try:
        cycle = await stop_cycle_action(cycle_id, deps=deps)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    return _serialize(cycle)
