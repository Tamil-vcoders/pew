# api/app/routes/suggestions.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.deps import get_llm_provider, get_project_repo, require
from app.domain.suggestions import Suggestion, build_suggestions
from app.ports.llm import LLMProvider
from app.ports.repos import ProjectRepo
from app.services.suggestions import draft_suggestions

router = APIRouter(prefix="/projects/{project_id}/prompts/{prompt_id}/suggestions", tags=["suggestions"])


class GenerateSuggestionsBody(BaseModel):
    text: str = Field(min_length=1)


def _serialize(suggestion: Suggestion) -> dict[str, object]:
    return {
        "ruleId": suggestion.rule_id,
        "technique": suggestion.technique,
        "evidence": suggestion.evidence,
        "oldText": suggestion.old_text,
        "newText": suggestion.new_text,
    }


@router.post("", dependencies=[Depends(require("contributor"))])
async def generate_suggestions(
    project_id: str,
    prompt_id: str,
    body: GenerateSuggestionsBody,
    projects: ProjectRepo = Depends(get_project_repo),
    llm: LLMProvider = Depends(get_llm_provider),
) -> list[dict[str, object]]:
    suggestions = build_suggestions(body.text)
    project = await projects.get(project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    model = project.cfg.models["suggestions"]

    drafted = await draft_suggestions(suggestions, model, llm)
    return [_serialize(s) for s in drafted]
