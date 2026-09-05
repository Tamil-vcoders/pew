# api/app/routes/projects.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.deps import get_project_repo, require
from app.domain.models import Project
from app.ports.repos import ProjectRepo

router = APIRouter(prefix="/projects", tags=["projects"])


class CreateProjectBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class RenameProjectBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)


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
async def rename_project(
    project_id: str, body: RenameProjectBody, repo: ProjectRepo = Depends(get_project_repo)
) -> dict[str, object]:
    existing = await repo.get(project_id)
    if existing is None:
        raise HTTPException(404, "Project not found")
    return _serialize(await repo.rename(project_id, body.name))
