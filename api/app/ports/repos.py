# api/app/ports/repos.py
from __future__ import annotations

from typing import Any, Protocol

from app.domain.models import (
    Case,
    CaseResult,
    CaseSource,
    ModelRates,
    Project,
    Prompt,
    RunStats,
    User,
    Version,
)


class AuditRepo(Protocol):
    async def append(
        self,
        *,
        actor: str,
        action: str,
        subject: str,
        before: dict[str, Any] | None,
        after: dict[str, Any] | None,
        # Optional backend-native transaction handle so a caller already inside a transaction
        # (e.g. FirestoreUserRepo's bootstrap) can stage this write on it instead of committing
        # separately. Kept as `Any` (rather than e.g. `firestore.AsyncTransaction`) so this port
        # stays adapter-agnostic; concrete adapters narrow it to their own transaction type.
        transaction: Any | None = None,
    ) -> None: ...


class UserRepo(Protocol):
    async def get(self, uid: str) -> User | None: ...

    async def get_or_bootstrap(self, uid: str, email: str | None, name: str | None) -> User: ...


class ProjectRepo(Protocol):
    async def list_all(self) -> list[Project]: ...

    async def create(self, name: str) -> Project: ...

    async def get(self, project_id: str) -> Project | None: ...

    async def rename(self, project_id: str, name: str) -> Project: ...


class PromptRepo(Protocol):
    async def list_by_project(self, project_id: str) -> list[Prompt]: ...

    async def get(self, project_id: str, prompt_id: str) -> Prompt | None: ...

    async def create(self, project_id: str, name: str, tags: list[str]) -> Prompt: ...

    async def update(
        self,
        project_id: str,
        prompt_id: str,
        *,
        name: str | None = None,
        tags: list[str] | None = None,
        archived: bool | None = None,
    ) -> Prompt: ...


class VersionRepo(Protocol):
    async def create(
        self,
        project_id: str,
        prompt_id: str,
        *,
        text: str,
        note: str | None,
        technique: str | None,
        created_by: str,
    ) -> Version: ...

    async def get(self, project_id: str, prompt_id: str, n: int) -> Version | None: ...


DATASET_CASE_CAP = 30  # devspec §15: cap dataset size in v1 (in-request execution ceiling)


class DatasetRepo(Protocol):
    async def list_by_prompt(self, project_id: str, prompt_id: str) -> list[Case]: ...

    async def create_case(
        self, project_id: str, prompt_id: str, *, input: str, expected: str, source: CaseSource
    ) -> Case:
        """Raises ValueError if the prompt's dataset is already at DATASET_CASE_CAP."""
        ...

    async def bulk_create(
        self, project_id: str, prompt_id: str, cases: list[tuple[str, str]], *, source: CaseSource
    ) -> list[Case]:
        """Raises ValueError if adding these cases would exceed DATASET_CASE_CAP."""
        ...

    async def update_case(
        self, project_id: str, prompt_id: str, case_id: str, *, input: str | None, expected: str | None
    ) -> Case: ...

    async def delete_case(self, project_id: str, prompt_id: str, case_id: str) -> None: ...


class RunRepo(Protocol):
    async def create_run(
        self, project_id: str, prompt_id: str, *, version_n: int, started_by: str
    ) -> str:
        """Creates the run doc (status="running") and returns its id."""
        ...

    async def write_case(self, project_id: str, prompt_id: str, run_id: str, result: CaseResult) -> None:
        """Writes one case result — this is what the browser's onSnapshot sees stream in."""
        ...

    async def finalize(
        self, project_id: str, prompt_id: str, run_id: str, *, stats: RunStats, cost_actual: float
    ) -> None:
        """One transaction: marks the run complete with its stats/cost, and denormalises
        bestScore onto the prompt doc if this run's composite improved on it."""
        ...

    async def set_human_grade(
        self, project_id: str, prompt_id: str, run_id: str, case_id: str, score: float | None
    ) -> None: ...


class ModelRegistryRepo(Protocol):
    async def get_all(self) -> dict[str, ModelRates]: ...
