# api/app/routes/projects.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.deps import get_cycle_repo, get_project_repo, require
from app.domain.models import Project, ProjectCfg
from app.ports.repos import CycleRepo, ProjectRepo

router = APIRouter(prefix="/projects", tags=["projects"])


class CreateProjectBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class UpdateProjectBody(BaseModel):
    """`name` is unlocked at all times; every other field is cycle-cfg and is refused
    (409) while a cycle is active in this project (devspec Appendix A: "cfg locked while a
    cycle is active in the project")."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    target: float | None = Field(default=None, gt=0)
    max_iter: int | None = Field(default=None, ge=1, alias="maxIter")
    budget: float | None = Field(default=None, gt=0)
    n_sug: int | None = Field(default=None, ge=1, le=4, alias="nSug")
    auto: bool | None = None
    weights: dict[str, float] | None = None
    models: dict[str, str] | None = None

    model_config = {"populate_by_name": True}

    def has_cfg_fields(self) -> bool:
        return any(
            v is not None
            for v in (self.target, self.max_iter, self.budget, self.n_sug, self.auto, self.weights, self.models)
        )


def _serialize(project: Project) -> dict[str, object]:
    return {
        "id": project.id,
        "name": project.name,
        "cfg": {
            "target": project.cfg.target,
            "maxIter": project.cfg.max_iter,
            "budget": project.cfg.budget,
            "nSug": project.cfg.n_sug,
            "auto": project.cfg.auto,
            "weights": project.cfg.weights,
            "models": project.cfg.models,
        },
    }


@router.get("", dependencies=[Depends(require("viewer"))])
async def list_projects(repo: ProjectRepo = Depends(get_project_repo)) -> list[dict[str, object]]:
    return [_serialize(p) for p in await repo.list_all()]


@router.post("", status_code=201, dependencies=[Depends(require("maintainer"))])
async def create_project(
    body: CreateProjectBody, repo: ProjectRepo = Depends(get_project_repo)
) -> dict[str, object]:
    return _serialize(await repo.create(body.name))


@router.patch("/{project_id}", dependencies=[Depends(require("maintainer"))])
async def update_project(
    project_id: str,
    body: UpdateProjectBody,
    repo: ProjectRepo = Depends(get_project_repo),
    cycles: CycleRepo = Depends(get_cycle_repo),
) -> dict[str, object]:
    existing = await repo.get(project_id)
    if existing is None:
        raise HTTPException(404, "Project not found")

    if body.has_cfg_fields():
        active = await cycles.get_active()
        if active is not None and active.project_id == project_id:
            raise HTTPException(409, "Project settings are locked while a cycle is active")
        cfg = existing.cfg
        cfg = ProjectCfg(
            target=body.target if body.target is not None else cfg.target,
            max_iter=body.max_iter if body.max_iter is not None else cfg.max_iter,
            budget=body.budget if body.budget is not None else cfg.budget,
            n_sug=body.n_sug if body.n_sug is not None else cfg.n_sug,
            auto=body.auto if body.auto is not None else cfg.auto,
            weights=body.weights if body.weights is not None else cfg.weights,
            models=body.models if body.models is not None else cfg.models,
        )
        existing = await repo.update_cfg(project_id, cfg)

    if body.name is not None:
        existing = await repo.rename(project_id, body.name)

    return _serialize(existing)
