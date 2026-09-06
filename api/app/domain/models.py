# api/app/domain/models.py
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

from app.domain.suggestions import Suggestion

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


CycleStage = Literal["dataset", "preview", "running", "grading", "checking", "suggesting", "ended"]
CycleStatus = Literal["active", "ended"]
CycleEndReason = Literal[
    "target-met", "iteration-cap", "budget-cap", "user-stopped", "no-suggestions", "not-converging"
]


@dataclass(frozen=True)
class CycleConfigSnapshot:
    """A copy of ProjectCfg taken at cycle start (devspec §3's "snapshot config" pattern) —
    the comparability tuple stays fixed for the cycle's lifetime even if a maintainer edits
    the live project cfg mid-cycle."""

    target: float
    max_iter: int
    budget: float
    n_sug: int
    auto: bool
    weights: dict[str, float]
    models: dict[str, str]


@dataclass(frozen=True)
class CycleScore:
    n: int
    score: float


@dataclass(frozen=True)
class CyclePending:
    candidates: list[Suggestion]
    selected: int


@dataclass(frozen=True)
class CycleLogEntry:
    ts: datetime
    message: str


@dataclass(frozen=True)
class Cycle:
    id: str
    prompt_id: str
    project_id: str
    status: CycleStatus
    stage: CycleStage
    iteration: int
    spent: float
    scores: list[CycleScore]
    end_reason: CycleEndReason | None
    best_n: int | None
    warned_flat: bool
    current_version_n: int | None
    current_run_id: str | None
    pending: CyclePending | None
    config: CycleConfigSnapshot
    log: list[CycleLogEntry]
    started_by: str


@dataclass(frozen=True)
class PrivacySettings:
    """Org-wide retention/telemetry preferences (devspec F11) — a single doc, read/written
    only via the API (see FirestoreOrgSettingsRepo)."""

    retention_days: int
    telemetry: bool


@dataclass(frozen=True)
class AuditEntry:
    """One append-only auditLogs/{entryId} row (AC-18.1's `{actor, action, subject, before,
    after, ts}` shape). `id` is the Firestore doc id — kept here (unlike the shape devspec §7
    lists as the doc's own fields) because the admin API serializes these as a flat list and
    needs a stable identifier per entry."""

    id: str
    actor: str
    action: str
    subject: str
    before: dict[str, Any] | None
    after: dict[str, Any] | None
    ts: datetime
