# api/app/routes/versions.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.deps import current_user, get_prompt_repo, get_version_repo, require
from app.domain.models import User, Version
from app.ports.repos import PromptRepo, VersionRepo

router = APIRouter(prefix="/projects/{project_id}/prompts/{prompt_id}/versions", tags=["versions"])


class CreateVersionBody(BaseModel):
    text: str = Field(min_length=1)
    note: str | None = Field(default=None, max_length=500)
    technique: str | None = Field(default=None, max_length=200)


def _serialize(version: Version) -> dict[str, object]:
    return {
        "n": version.n,
        "text": version.text,
        "note": version.note,
        "technique": version.technique,
        "createdBy": version.created_by,
        "createdAt": version.created_at.isoformat() if version.created_at else None,
    }


@router.post("", status_code=201, dependencies=[Depends(require("contributor"))])
async def create_version(
    project_id: str,
    prompt_id: str,
    body: CreateVersionBody,
    user: User = Depends(current_user),
    prompts: PromptRepo = Depends(get_prompt_repo),
    versions: VersionRepo = Depends(get_version_repo),
) -> dict[str, object]:
    existing = await prompts.get(project_id, prompt_id)
    if existing is None:
        raise HTTPException(404, "Prompt not found")
    version = await versions.create(
        project_id, prompt_id,
        text=body.text, note=body.note, technique=body.technique, created_by=user.uid,
    )
    return _serialize(version)
