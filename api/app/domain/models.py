# api/app/domain/models.py
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

ROLES = ("viewer", "contributor", "maintainer", "administrator")


@dataclass(frozen=True)
class User:
    uid: str
    email: str
    name: str
    role: str
    created_at: datetime


@dataclass(frozen=True)
class ProjectCfg:
    target: float = 8.0
    max_iter: int = 4
    budget: float = 0.6
    n_sug: int = 2
    auto: bool = False
    weights: dict[str, float] = field(
        default_factory=lambda: {"code": 1.0, "model": 1.0, "human": 1.0}
    )
    # gemini-2.5-pro/flash (devspec §6.2's original pinned models) return 404 "no longer
    # available to new users" as of 2026-09; gemini-3.1-pro-preview/gemini-3.6-flash are the
    # confirmed-working, concretely-priced replacements (verified live against the Gemini API
    # 2026-09-06 — re-verify before relying on this for real spend decisions, since the
    # available model roster shifts).
    models: dict[str, str] = field(
        default_factory=lambda: {
            "execution": "gemini-3.1-pro-preview",
            "grading": "gemini-3.6-flash",
            "suggestions": "gemini-3.6-flash",
            "datasetGen": "gemini-3.6-flash",
        }
    )


@dataclass(frozen=True)
class Project:
    id: str
    name: str
    cfg: ProjectCfg


@dataclass(frozen=True)
class Prompt:
    id: str
    project_id: str
    name: str
    tags: list[str]
    archived: bool
    best_score: float | None
    latest_version: int


@dataclass(frozen=True)
class Version:
    n: int
    text: str
    note: str | None
    technique: str | None
    created_by: str
    created_at: datetime | None


CaseSource = Literal["manual", "generated"]


@dataclass(frozen=True)
class Case:
    id: str
    input: str
    expected: str
    order: int
    source: CaseSource


@dataclass(frozen=True)
class GraderVerdict:
    """A model grader's structured response — score plus the justification the PRD
    requires alongside it (a bare score is never accepted, AC-4.5)."""

    score: float
    weakness: str | None
    reasoning: str


@dataclass(frozen=True)
class SuggestionDraft:
    """A Gemini-drafted prompt rewrite for one technique (see LLMProvider.suggest)."""

    text: str


CaseStatus = Literal["done", "error"]


@dataclass(frozen=True)
class CaseResult:
    index: int
    case_id: str
    output: str | None
    code_score: float | None
    model_score: float | None
    human_score: float | None
    weakness: str | None
    reasoning: str | None
    tokens_in: int
    tokens_out: int
    status: CaseStatus
    error: str | None = None


@dataclass(frozen=True)
class RunStats:
    composite: float | None
    code_avg: float | None
    model_avg: float | None
    human_count: int
    case_count: int
    error_count: int


RunStatus = Literal["running", "complete"]


@dataclass(frozen=True)
class Run:
    id: str
    version_n: int
    status: RunStatus
    composite: float | None
    code_avg: float | None
    model_avg: float | None
    cost_estimate: float | None
    cost_actual: float | None
    started_by: str
    started_at: datetime | None


@dataclass(frozen=True)
class ModelRates:
    label: str
    rate_in_per_1m: float
    rate_out_per_1m: float
    enabled: bool
