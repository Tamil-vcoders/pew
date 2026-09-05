# api/app/routes/prompts.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.deps import ROLE_LEVEL, current_user, get_prompt_repo, require
from app.domain.models import Prompt, User
from app.ports.repos import PromptRepo

router = APIRouter(prefix="/projects/{project_id}/prompts", tags=["prompts"])


class CreatePromptBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    tags: list[str] = []

    # FirestorePromptRepo strips the name before storing it, so a name that is only
    # whitespace (e.g. "   ") would pass the min_length=1 check above and then be stored
    # as "". Strip here too, before the length check runs, so a whitespace-only name is
    # rejected with a 422 instead of silently persisted as empty.
    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("name must not be blank")
        return stripped


class UpdatePromptBody(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    tags: list[str] | None = None
    archived: bool | None = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("name must not be blank")
        return stripped


def _serialize(prompt: Prompt) -> dict[str, object]:
    return {
        "id": prompt.id,
        "projectId": prompt.project_id,
        "name": prompt.name,
        "tags": prompt.tags,
        "archived": prompt.archived,
        "bestScore": prompt.best_score,
        "latestVersion": prompt.latest_version,
    }


@router.get("", dependencies=[Depends(require("viewer"))])
async def list_prompts(
    project_id: str, repo: PromptRepo = Depends(get_prompt_repo)
) -> list[dict[str, object]]:
    return [_serialize(p) for p in await repo.list_by_project(project_id)]


@router.post("", status_code=201, dependencies=[Depends(require("contributor"))])
async def create_prompt(
    project_id: str, body: CreatePromptBody, repo: PromptRepo = Depends(get_prompt_repo)
) -> dict[str, object]:
    try:
        return _serialize(await repo.create(project_id, body.name, body.tags))
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.patch("/{prompt_id}")
async def update_prompt(
    project_id: str,
    prompt_id: str,
    body: UpdatePromptBody,
    user: User = Depends(current_user),
    repo: PromptRepo = Depends(get_prompt_repo),
) -> dict[str, object]:
    min_role = "maintainer" if body.archived is not None else "contributor"
    if ROLE_LEVEL.get(user.role, -1) < ROLE_LEVEL[min_role]:
        raise HTTPException(403, f"Requires {min_role} role")

    existing = await repo.get(project_id, prompt_id)
    if existing is None:
        raise HTTPException(404, "Prompt not found")
    try:
        updated = await repo.update(
            project_id, prompt_id, name=body.name, tags=body.tags, archived=body.archived
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return _serialize(updated)
