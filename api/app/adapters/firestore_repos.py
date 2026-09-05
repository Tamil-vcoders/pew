# api/app/adapters/firestore_repos.py
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from google.cloud import firestore

from app.domain.models import Project, ProjectCfg, Prompt, User, Version
from app.ports.repos import AuditRepo


async def _snapshot(
    transaction: firestore.AsyncTransaction,
    ref: firestore.AsyncDocumentReference,
) -> firestore.DocumentSnapshot:
    # NOTE: the brief's originally-specified pattern —
    #   `async for snap in await transaction.get(ref): return snap`
    # — does not work against firebase-admin 7.5.0 / google-cloud-firestore 2.30.0: for a
    # single AsyncDocumentReference, `AsyncTransaction.get()` internally does
    # `return await self._client.get_all([ref], transaction=self, ...)`, and `get_all` is an
    # async-generator function (it has a `yield` in its body), so awaiting its call raises
    # `TypeError: object async_generator can't be used in 'await' expression`. Verified live
    # against the Firestore emulator (transaction.get(ref) fails every time for a doc ref).
    # The working, still-transactional replacement is `ref.get(transaction=transaction)`,
    # which threads the transaction id through `_prep_batch_get` the same way and was
    # confirmed race-safe with two concurrent transactions against the emulator.
    return await ref.get(transaction=transaction)


def _user_from_snap(snap: firestore.DocumentSnapshot) -> User:
    data = snap.to_dict() or {}
    created = data.get("createdAt")
    return User(
        uid=snap.id,
        email=data.get("email", ""),
        name=data.get("name", ""),
        role=data.get("role", "viewer"),
        created_at=created if isinstance(created, datetime) else datetime.now(UTC),
    )


class FirestoreAuditRepo:
    def __init__(self, client: firestore.AsyncClient) -> None:
        self._client = client

    async def append(
        self,
        *,
        actor: str,
        action: str,
        subject: str,
        before: dict[str, Any] | None,
        after: dict[str, Any] | None,
        transaction: firestore.AsyncTransaction | None = None,
    ) -> None:
        ref = self._client.collection("auditLogs").document()
        payload = {
            "actor": actor,
            "action": action,
            "subject": subject,
            "before": before,
            "after": after,
            "ts": firestore.SERVER_TIMESTAMP,
        }
        if transaction is not None:
            transaction.set(ref, payload)
        else:
            await ref.set(payload)


class FirestoreUserRepo:
    def __init__(self, client: firestore.AsyncClient, audit: AuditRepo) -> None:
        self._client = client
        self._audit = audit

    def _ref(self, uid: str) -> firestore.AsyncDocumentReference:
        return self._client.collection("users").document(uid)

    async def get(self, uid: str) -> User | None:
        snap = await self._ref(uid).get()
        return _user_from_snap(snap) if snap.exists else None

    async def get_or_bootstrap(self, uid: str, email: str | None, name: str | None) -> User:
        bootstrap_ref = self._client.collection("meta").document("bootstrap")

        @firestore.async_transactional
        async def _run(transaction: firestore.AsyncTransaction) -> User:
            user_ref = self._ref(uid)
            existing = await _snapshot(transaction, user_ref)
            if existing.exists:
                return _user_from_snap(existing)

            bootstrap_snap = await _snapshot(transaction, bootstrap_ref)
            is_first = not bootstrap_snap.exists
            role = "administrator" if is_first else "viewer"
            created_at = datetime.now(UTC)
            display_name = name or email or uid

            transaction.set(
                user_ref,
                {"name": display_name, "email": email or "", "role": role, "createdAt": created_at},
            )
            if is_first:
                transaction.set(bootstrap_ref, {"adminAssigned": True, "adminUid": uid})
                await self._audit.append(
                    actor=uid,
                    action="bootstrap-admin",
                    subject=uid,
                    before=None,
                    after={"role": role},
                    transaction=transaction,
                )
            return User(uid=uid, email=email or "", name=display_name, role=role, created_at=created_at)

        transaction = self._client.transaction()
        return await _run(transaction)


def _cfg_to_dict(cfg: ProjectCfg) -> dict[str, Any]:
    return {
        "target": cfg.target,
        "maxIter": cfg.max_iter,
        "budget": cfg.budget,
        "nSug": cfg.n_sug,
        "auto": cfg.auto,
        "weights": cfg.weights,
        "models": cfg.models,
    }


def _cfg_from_dict(data: dict[str, Any]) -> ProjectCfg:
    default = ProjectCfg()
    return ProjectCfg(
        target=data.get("target", default.target),
        max_iter=data.get("maxIter", default.max_iter),
        budget=data.get("budget", default.budget),
        n_sug=data.get("nSug", default.n_sug),
        auto=data.get("auto", default.auto),
        weights=data.get("weights", default.weights),
        models=data.get("models", default.models),
    )


def _project_from_snap(snap: firestore.DocumentSnapshot) -> Project:
    data = snap.to_dict() or {}
    return Project(id=snap.id, name=data.get("name", ""), cfg=_cfg_from_dict(data.get("cfg", {})))


class FirestoreProjectRepo:
    def __init__(self, client: firestore.AsyncClient) -> None:
        self._client = client

    def _collection(self) -> firestore.AsyncCollectionReference:
        return self._client.collection("projects")

    async def list_all(self) -> list[Project]:
        return [
            _project_from_snap(snap)
            async for snap in self._collection().order_by("name").stream()
        ]

    async def create(self, name: str) -> Project:
        ref = self._collection().document()
        cfg = ProjectCfg()
        await ref.set({"name": name, "cfg": _cfg_to_dict(cfg)})
        return Project(id=ref.id, name=name, cfg=cfg)

    async def get(self, project_id: str) -> Project | None:
        snap = await self._collection().document(project_id).get()
        return _project_from_snap(snap) if snap.exists else None

    async def rename(self, project_id: str, name: str) -> Project:
        ref = self._collection().document(project_id)
        await ref.update({"name": name})
        snap = await ref.get()
        return _project_from_snap(snap)


def _prompt_from_snap(project_id: str, snap: firestore.DocumentSnapshot) -> Prompt:
    data = snap.to_dict() or {}
    return Prompt(
        id=snap.id,
        project_id=project_id,
        name=data.get("name", ""),
        tags=data.get("tags", []),
        archived=data.get("archived", False),
        best_score=data.get("bestScore"),
        latest_version=data.get("latestVersion", 0),
    )


class FirestorePromptRepo:
    def __init__(self, client: firestore.AsyncClient) -> None:
        self._client = client

    def _collection(self, project_id: str) -> firestore.AsyncCollectionReference:
        # `AsyncDocumentReference.collection()` (used here to reach the nested "prompts"
        # subcollection) has no return-type annotation upstream, so mypy would otherwise infer
        # `Any` and flag a bare `return` as `no-any-return`; the explicit annotation below
        # narrows it back to the declared type.
        collection: firestore.AsyncCollectionReference = (
            self._client.collection("projects").document(project_id).collection("prompts")
        )
        return collection

    async def list_by_project(self, project_id: str) -> list[Prompt]:
        return [
            _prompt_from_snap(project_id, snap)
            async for snap in self._collection(project_id).order_by("name").stream()
        ]

    async def get(self, project_id: str, prompt_id: str) -> Prompt | None:
        snap = await self._collection(project_id).document(prompt_id).get()
        return _prompt_from_snap(project_id, snap) if snap.exists else None

    async def create(self, project_id: str, name: str, tags: list[str]) -> Prompt:
        collection = self._collection(project_id)
        ref = collection.document()

        @firestore.async_transactional
        async def _run(transaction: firestore.AsyncTransaction) -> None:
            # NOTE: unlike a single-document read (see `_snapshot()` above, which works around
            # `AsyncTransaction.get()`'s broken document-ref branch), a *query* inside a
            # transaction goes through `AsyncTransaction.get()`'s other branch:
            # `return ref_or_query.stream(transaction=self, **kwargs)` — no internal `await` on
            # that line, and `AsyncQuery.stream()` is a plain (non-async) method that eagerly
            # builds and returns an `AsyncStreamGenerator` rather than a coroutine. So
            # `await transaction.get(query)` just runs the (non-awaiting) branch body and hands
            # back that generator — no async-generator-awaited-directly bug here. Confirmed by
            # reading `google/cloud/firestore_v1/async_transaction.py` /
            # `async_query.py` source directly (installed firebase-admin 7.5.0 /
            # google-cloud-firestore 2.30.0) and by this test suite passing live against the
            # Firestore emulator.
            # NOTE ON RACE SAFETY (not full): this uniqueness check is a *query*
            # (`.where(...)`), not a read of one specific, already-existing keyed document.
            # Firestore transactions only get a real optimistic-concurrency precondition on
            # documents they actually *read*; a query that matches zero documents creates no
            # precondition on documents that don't exist yet, so it does not "lock" the name
            # the way `_snapshot()`'s single-doc reads do (e.g. `meta/bootstrap` in
            # `FirestoreUserRepo.get_or_bootstrap`, which reads one specific doc and so *does*
            # get a real precondition). Two `create()` calls for the exact same name, racing
            # concurrently, can both observe an empty `clashes` result and both commit,
            # producing a genuine duplicate. This check is still worth having — it prevents
            # the overwhelmingly common case (a name that already exists by the time this
            # runs) — it just is not a hard uniqueness guarantee under true concurrency. A
            # fully race-safe version would replace this query with a keyed marker document
            # (e.g. `projects/{project_id}/promptNames/{nameLower}` written via
            # `transaction.create()`, which fails at commit if the doc already exists) instead
            # of a query; deferred as a follow-up rather than risking this already-tested path.
            clash_query = collection.where("nameLower", "==", name.strip().lower()).limit(1)
            clashes = [snap async for snap in await transaction.get(clash_query)]
            if clashes:
                raise ValueError(f"A prompt named '{name}' already exists in this project")
            transaction.set(
                ref,
                {
                    "name": name.strip(),
                    "nameLower": name.strip().lower(),
                    "tags": tags,
                    "archived": False,
                    "bestScore": None,
                    "latestVersion": 0,
                },
            )

        transaction = self._client.transaction()
        await _run(transaction)
        return Prompt(
            id=ref.id, project_id=project_id, name=name.strip(), tags=tags,
            archived=False, best_score=None, latest_version=0,
        )

    async def update(
        self,
        project_id: str,
        prompt_id: str,
        *,
        name: str | None = None,
        tags: list[str] | None = None,
        archived: bool | None = None,
    ) -> Prompt:
        collection = self._collection(project_id)
        ref = collection.document(prompt_id)

        @firestore.async_transactional
        async def _run(transaction: firestore.AsyncTransaction) -> None:
            if name is not None:
                # limit(2), not 1: if the single hit under limit(1) happened to be this same
                # prompt (renaming "Draft" to itself, say), a real second same-named document
                # would go undetected. limit(2) guarantees at least one *other* document shows
                # up in `clashes` when one genuinely exists, so the `any(...)` check below has
                # something real to inspect even when the prompt's own doc is the first hit.
                clash_query = collection.where("nameLower", "==", name.strip().lower()).limit(2)
                clashes = [snap async for snap in await transaction.get(clash_query)]
                if any(snap.id != prompt_id for snap in clashes):
                    raise ValueError(f"A prompt named '{name}' already exists in this project")
            patch: dict[str, Any] = {}
            if name is not None:
                patch["name"] = name.strip()
                patch["nameLower"] = name.strip().lower()
            if tags is not None:
                patch["tags"] = tags
            if archived is not None:
                patch["archived"] = archived
            if patch:
                transaction.update(ref, patch)

        transaction = self._client.transaction()
        await _run(transaction)
        snap = await ref.get()
        return _prompt_from_snap(project_id, snap)


class FirestoreVersionRepo:
    def __init__(self, client: firestore.AsyncClient) -> None:
        self._client = client

    def _prompt_ref(self, project_id: str, prompt_id: str) -> firestore.AsyncDocumentReference:
        ref: firestore.AsyncDocumentReference = (
            self._client.collection("projects").document(project_id)
            .collection("prompts").document(prompt_id)
        )
        return ref

    def _versions_collection(
        self, project_id: str, prompt_id: str
    ) -> firestore.AsyncCollectionReference:
        collection: firestore.AsyncCollectionReference = (
            self._prompt_ref(project_id, prompt_id).collection("versions")
        )
        return collection

    async def create(
        self,
        project_id: str,
        prompt_id: str,
        *,
        text: str,
        note: str | None,
        technique: str | None,
        created_by: str,
    ) -> Version:
        prompt_ref = self._prompt_ref(project_id, prompt_id)
        versions = self._versions_collection(project_id, prompt_id)

        @firestore.async_transactional
        async def _run(transaction: firestore.AsyncTransaction) -> tuple[int, datetime]:
            prompt_snap = await _snapshot(transaction, prompt_ref)
            if not prompt_snap.exists:
                raise LookupError("Prompt not found")
            current = prompt_snap.to_dict() or {}
            next_n = int(current.get("latestVersion", 0)) + 1
            created_at = datetime.now(UTC)
            transaction.set(
                versions.document(str(next_n)),
                {
                    "n": next_n,
                    "text": text,
                    "note": note,
                    "technique": technique,
                    "createdBy": created_by,
                    "createdAt": created_at,
                },
            )
            transaction.update(prompt_ref, {"latestVersion": next_n})
            return next_n, created_at

        transaction = self._client.transaction()
        n, created_at = await _run(transaction)
        return Version(
            n=n, text=text, note=note, technique=technique,
            created_by=created_by, created_at=created_at,
        )
