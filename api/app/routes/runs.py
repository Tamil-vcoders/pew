# api/app/routes/runs.py
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from app.adapters import inline_tasks
from app.deps import (
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
from app.domain.estimate import Estimate, build_estimate, run_estimate_rows
from app.domain.models import User
from app.domain.rendering import render
from app.ports.llm import LLMProvider
from app.ports.repos import (
    CycleRepo,
    DatasetRepo,
    ModelRegistryRepo,
    ProjectRepo,
    PromptRepo,
    RunRepo,
    VersionRepo,
)
from app.services.runs import execute_run

router = APIRouter(prefix="/projects/{project_id}/prompts/{prompt_id}/runs", tags=["runs"])


class StartRunBody(BaseModel):
    text: str = Field(min_length=1)


class HumanGradeBody(BaseModel):
    score: float | None = Field(default=None, ge=0, le=10)


def _serialize_estimate(est: Estimate, n_cases: int) -> dict[str, object]:
    return {
        "rows": [
            {"stage": r.stage, "model": r.model, "tokensIn": r.tokens_in, "tokensOut": r.tokens_out, "cost": r.cost}
            for r in est.rows
        ],
        "totalIn": est.total_in,
        "totalOut": est.total_out,
        "totalCost": est.total_cost,
        "nCases": n_cases,
    }


@router.post("", status_code=201, dependencies=[Depends(require("contributor"))])
async def start_run(
    project_id: str,
    prompt_id: str,
    body: StartRunBody,
    background_tasks: BackgroundTasks,
    user: User = Depends(current_user),
    projects: ProjectRepo = Depends(get_project_repo),
    prompts: PromptRepo = Depends(get_prompt_repo),
    versions: VersionRepo = Depends(get_version_repo),
    dataset: DatasetRepo = Depends(get_dataset_repo),
    runs: RunRepo = Depends(get_run_repo),
    registry: ModelRegistryRepo = Depends(get_model_registry_repo),
    llm: LLMProvider = Depends(get_llm_provider),
    cycles: CycleRepo = Depends(get_cycle_repo),
) -> dict[str, object]:
    project = await projects.get(project_id)
    prompt = await prompts.get(project_id, prompt_id)
    if project is None or prompt is None:
        raise HTTPException(404, "Project or prompt not found")

    # v1 simplification (devspec §1.2): one active cycle at a time, globally — a manual
    # "Run once" is blocked while ANY cycle is active anywhere, not just this prompt's.
    if await cycles.get_active() is not None:
        raise HTTPException(409, "A cycle is active — manual runs are blocked until it ends")

    current_version = await versions.get(project_id, prompt_id, prompt.latest_version) if prompt.latest_version else None
    if current_version is not None and body.text == current_version.text:
        version_n = prompt.latest_version
    else:
        created = await versions.create(
            project_id, prompt_id, text=body.text, note="Manual edit", technique=None, created_by=user.uid,
        )
        version_n = created.n

    cases = await dataset.list_by_prompt(project_id, prompt_id)
    run_id = await runs.create_run(project_id, prompt_id, version_n=version_n, started_by=user.uid)
    rates = await registry.get_all()

    inline_tasks.schedule(
        background_tasks, execute_run,
        project_id=project_id, prompt_id=prompt_id, run_id=run_id,
        prompt_text=body.text, cases=cases, models=project.cfg.models,
        weights=project.cfg.weights, rates=rates, llm=llm, runs=runs,
    )
    return {"runId": run_id, "versionN": version_n}


@router.get("/estimate", dependencies=[Depends(require("viewer"))])
async def get_estimate(
    project_id: str,
    prompt_id: str,
    text: str,
    projects: ProjectRepo = Depends(get_project_repo),
    dataset: DatasetRepo = Depends(get_dataset_repo),
    registry: ModelRegistryRepo = Depends(get_model_registry_repo),
    llm: LLMProvider = Depends(get_llm_provider),
) -> dict[str, object]:
    project = await projects.get(project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    cases = await dataset.list_by_prompt(project_id, prompt_id)
    rates = await registry.get_all()

    exec_model = project.cfg.models["execution"]
    exec_tokens_in = 0
    for case in cases:
        exec_tokens_in += await llm.count_tokens(render(text, case.input), exec_model)

    rows = run_estimate_rows(project.cfg.models, len(cases), exec_tokens_in=exec_tokens_in)
    return _serialize_estimate(build_estimate(rows, rates), len(cases))


@router.put("/{run_id}/cases/{case_id}/human-grade", dependencies=[Depends(require("contributor"))])
async def set_human_grade(
    project_id: str, prompt_id: str, run_id: str, case_id: str, body: HumanGradeBody,
    runs: RunRepo = Depends(get_run_repo),
) -> dict[str, object]:
    await runs.set_human_grade(project_id, prompt_id, run_id, case_id, body.score)
    return {"caseId": case_id, "score": body.score}
