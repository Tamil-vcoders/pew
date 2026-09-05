# api/app/domain/models.py
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

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
    models: dict[str, str] = field(
        default_factory=lambda: {
            "execution": "gemini-2.5-pro",
            "grading": "gemini-2.5-flash",
            "suggestions": "gemini-2.5-flash",
            "datasetGen": "gemini-2.5-flash",
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
