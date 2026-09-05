# api/app/ports/repos.py
from __future__ import annotations

from typing import Any, Protocol

from app.domain.models import Project, Prompt, User


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
