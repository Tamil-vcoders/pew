# api/app/routes/datasets.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.deps import (
    get_cycle_repo,
    get_dataset_repo,
    get_llm_provider,
    get_model_registry_repo,
    get_project_repo,
    require,
)
from app.domain.estimate import TOK, call_cost
from app.domain.models import Case
from app.ports.llm import LLMCallError, LLMProvider
from app.ports.repos import CycleRepo, DatasetRepo, ModelRegistryRepo, ProjectRepo

router = APIRouter(prefix="/projects/{project_id}/prompts/{prompt_id}/dataset", tags=["dataset"])


async def _guard_not_frozen(prompt_id: str, cycles: CycleRepo = Depends(get_cycle_repo)) -> None:
    """Devspec's dataset-freeze rule: once a cycle's first iteration has started, its
    dataset is frozen for the owning prompt so scores stay comparable across iterations."""
    active = await cycles.get_active()
    if active is not None and active.prompt_id == prompt_id and active.iteration >= 1:
        raise HTTPException(409, "Dataset is frozen for this cycle")


class CreateCaseBody(BaseModel):
    input: str = Field(min_length=1)
    expected: str = Field(min_length=1)


class UpdateCaseBody(BaseModel):
    input: str | None = Field(default=None, min_length=1)
    expected: str | None = Field(default=None, min_length=1)


class GenerateCasesBody(BaseModel):
    text: str = Field(min_length=1)
    n: int = Field(default=3, ge=1, le=10)


def _serialize(case: Case) -> dict[str, object]:
    return {
        "id": case.id, "input": case.input, "expected": case.expected,
        "order": case.order, "source": case.source,
    }


@router.get("", dependencies=[Depends(require("contributor"))])
async def list_cases(
    project_id: str, prompt_id: str, repo: DatasetRepo = Depends(get_dataset_repo)
) -> list[dict[str, object]]:
    return [_serialize(c) for c in await repo.list_by_prompt(project_id, prompt_id)]


@router.post(
    "", status_code=201, dependencies=[Depends(require("contributor")), Depends(_guard_not_frozen)]
)
async def create_case(
    project_id: str, prompt_id: str, body: CreateCaseBody, repo: DatasetRepo = Depends(get_dataset_repo)
) -> dict[str, object]:
    try:
        case = await repo.create_case(
            project_id, prompt_id, input=body.input, expected=body.expected, source="manual"
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return _serialize(case)


@router.patch(
    "/{case_id}", dependencies=[Depends(require("contributor")), Depends(_guard_not_frozen)]
)
async def update_case(
    project_id: str, prompt_id: str, case_id: str, body: UpdateCaseBody,
    repo: DatasetRepo = Depends(get_dataset_repo),
) -> dict[str, object]:
    return _serialize(
        await repo.update_case(project_id, prompt_id, case_id, input=body.input, expected=body.expected)
    )


@router.delete(
    "/{case_id}", status_code=204, dependencies=[Depends(require("contributor")), Depends(_guard_not_frozen)]
)
async def delete_case(
    project_id: str, prompt_id: str, case_id: str, repo: DatasetRepo = Depends(get_dataset_repo)
) -> None:
    await repo.delete_case(project_id, prompt_id, case_id)


@router.post(
    "/generate", dependencies=[Depends(require("contributor")), Depends(_guard_not_frozen)]
)
async def generate_cases(
    project_id: str,
    prompt_id: str,
    body: GenerateCasesBody,
    projects: ProjectRepo = Depends(get_project_repo),
    dataset: DatasetRepo = Depends(get_dataset_repo),
    registry: ModelRegistryRepo = Depends(get_model_registry_repo),
    llm: LLMProvider = Depends(get_llm_provider),
) -> dict[str, object]:
    project = await projects.get(project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    model = project.cfg.models["datasetGen"]

    try:
        generated = await llm.generate_cases(body.text, body.n, model)
    except LLMCallError as exc:
        raise HTTPException(502, f"Dataset generation failed: {exc}") from exc

    try:
        created = await dataset.bulk_create(
            project_id, prompt_id,
            [(c["input"], c["expected"]) for c in generated], source="generated",
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc

    rates = await registry.get_all()
    rate = rates[model]
    cost = body.n * call_cost(rate.rate_in_per_1m, rate.rate_out_per_1m, TOK["datasetGen"]["in"], TOK["datasetGen"]["out"])
    return {"cases": [_serialize(c) for c in created], "cost": cost, "model": model}
