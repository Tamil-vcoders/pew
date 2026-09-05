# api/app/routes/suggestions.py
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.deps import require
from app.domain.suggestions import Suggestion, build_suggestions

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
    project_id: str, prompt_id: str, body: GenerateSuggestionsBody
) -> list[dict[str, object]]:
    # project_id/prompt_id are unused today (suggestions are a pure function of `text`);
    # they stay in the path so Phase 3 can swap in Gemini-drafted rewrites — which will
    # need the project's model config and the prompt's run history — without a URL change.
    return [_serialize(s) for s in build_suggestions(body.text)]
