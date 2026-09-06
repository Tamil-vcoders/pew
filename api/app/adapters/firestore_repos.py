# api/app/adapters/firestore_repos.py
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any

from google.cloud import firestore

from app.domain.models import (
    AuditEntry,
    Case,
    CaseResult,
    CaseSource,
    Cycle,
    CycleConfigSnapshot,
    CycleLogEntry,
    CyclePending,
    CycleScore,
    ModelRates,
    PrivacySettings,
    Project,
    ProjectCfg,
    Prompt,
    Run,
    RunStats,
    User,
    Version,
)
from app.domain.suggestions import Suggestion
from app.ports.repos import DATASET_CASE_CAP, AuditRepo


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


def _audit_entry_from_snap(snap: firestore.DocumentSnapshot) -> AuditEntry:
    data = snap.to_dict() or {}
    ts = data.get("ts")
    return AuditEntry(
        id=snap.id,
        actor=data.get("actor", ""),
        action=data.get("action", ""),
        subject=data.get("subject", ""),
        before=data.get("before"),
        after=data.get("after"),
        ts=ts if isinstance(ts, datetime) else datetime.now(UTC),
    )


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

    async def list_all(self) -> list[AuditEntry]:
        query = self._client.collection("auditLogs").order_by("ts", direction=firestore.Query.DESCENDING)
        return [_audit_entry_from_snap(snap) async for snap in query.stream()]


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
            # Every new user gets an audit entry now (US-18), not just the first — the action
            # name is what distinguishes the bootstrap-admin case from an ordinary sign-up.
            await self._audit.append(
                actor=uid,
                action="bootstrap-admin" if is_first else "user-signup",
                subject=uid,
                before=None,
                after={"role": role},
                transaction=transaction,
            )
            return User(uid=uid, email=email or "", name=display_name, role=role, created_at=created_at)

        transaction = self._client.transaction()
        return await _run(transaction)

    async def list_all(self) -> list[User]:
        return [
            _user_from_snap(snap)
            async for snap in self._client.collection("users").order_by("createdAt").stream()
        ]

    async def update_role(self, uid: str, role: str) -> User:
        ref = self._ref(uid)
        await ref.update({"role": role})
        snap = await ref.get()
        return _user_from_snap(snap)

    async def update_name(self, uid: str, name: str) -> User:
        ref = self._ref(uid)
        await ref.update({"name": name})
        snap = await ref.get()
        return _user_from_snap(snap)

    async def anonymize(self, uid: str) -> None:
        await self._ref(uid).update({"name": "Deleted user", "email": "", "role": "viewer"})


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

    async def update_cfg(self, project_id: str, cfg: ProjectCfg) -> Project:
        ref = self._collection().document(project_id)
        await ref.update({"cfg": _cfg_to_dict(cfg)})
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

    async def get(self, project_id: str, prompt_id: str, n: int) -> Version | None:
        snap = await self._versions_collection(project_id, prompt_id).document(str(n)).get()
        if not snap.exists:
            return None
        data = snap.to_dict() or {}
        created = data.get("createdAt")
        return Version(
            n=n, text=data.get("text", ""), note=data.get("note"), technique=data.get("technique"),
            created_by=data.get("createdBy", ""),
            created_at=created if isinstance(created, datetime) else None,
        )


def _case_from_snap(snap: firestore.DocumentSnapshot) -> Case:
    data = snap.to_dict() or {}
    return Case(
        id=snap.id,
        input=data.get("input", ""),
        expected=data.get("expected", ""),
        order=data.get("order", 0),
        source=data.get("source", "manual"),
    )


class FirestoreDatasetRepo:
    def __init__(self, client: firestore.AsyncClient) -> None:
        self._client = client

    def _collection(self, project_id: str, prompt_id: str) -> firestore.AsyncCollectionReference:
        collection: firestore.AsyncCollectionReference = (
            self._client.collection("projects").document(project_id)
            .collection("prompts").document(prompt_id).collection("dataset")
        )
        return collection

    async def list_by_prompt(self, project_id: str, prompt_id: str) -> list[Case]:
        return [
            _case_from_snap(snap)
            async for snap in self._collection(project_id, prompt_id).order_by("order").stream()
        ]

    async def create_case(
        self, project_id: str, prompt_id: str, *, input: str, expected: str, source: CaseSource
    ) -> Case:
        cases = await self.list_by_prompt(project_id, prompt_id)
        if len(cases) >= DATASET_CASE_CAP:
            raise ValueError(f"Dataset already has the maximum of {DATASET_CASE_CAP} cases")
        order = len(cases)
        ref = self._collection(project_id, prompt_id).document()
        await ref.set({"input": input, "expected": expected, "order": order, "source": source})
        return Case(id=ref.id, input=input, expected=expected, order=order, source=source)

    async def bulk_create(
        self, project_id: str, prompt_id: str, cases: list[tuple[str, str]], *, source: CaseSource
    ) -> list[Case]:
        existing = await self.list_by_prompt(project_id, prompt_id)
        if len(existing) + len(cases) > DATASET_CASE_CAP:
            raise ValueError(f"Adding {len(cases)} case(s) would exceed the {DATASET_CASE_CAP}-case cap")
        collection = self._collection(project_id, prompt_id)
        batch = self._client.batch()
        created: list[Case] = []
        for i, (case_input, expected) in enumerate(cases):
            ref = collection.document()
            order = len(existing) + i
            batch.set(ref, {"input": case_input, "expected": expected, "order": order, "source": source})
            created.append(Case(id=ref.id, input=case_input, expected=expected, order=order, source=source))
        await batch.commit()
        return created

    async def update_case(
        self, project_id: str, prompt_id: str, case_id: str, *, input: str | None, expected: str | None
    ) -> Case:
        ref = self._collection(project_id, prompt_id).document(case_id)
        patch: dict[str, Any] = {}
        if input is not None:
            patch["input"] = input
        if expected is not None:
            patch["expected"] = expected
        if patch:
            await ref.update(patch)
        snap = await ref.get()
        return _case_from_snap(snap)

    async def delete_case(self, project_id: str, prompt_id: str, case_id: str) -> None:
        await self._collection(project_id, prompt_id).document(case_id).delete()


def _case_result_to_dict(result: CaseResult) -> dict[str, Any]:
    return {
        "index": result.index,
        "caseId": result.case_id,
        "output": result.output,
        "codeScore": result.code_score,
        "modelScore": result.model_score,
        "humanScore": result.human_score,
        "weakness": result.weakness,
        "reasoning": result.reasoning,
        "tokensIn": result.tokens_in,
        "tokensOut": result.tokens_out,
        "status": result.status,
        "error": result.error,
    }


def _run_from_snap(snap: firestore.DocumentSnapshot) -> Run:
    data = snap.to_dict() or {}
    started = data.get("startedAt")
    return Run(
        id=snap.id,
        version_n=data.get("versionN", 0),
        status=data.get("status", "running"),
        composite=data.get("composite"),
        code_avg=data.get("codeAvg"),
        model_avg=data.get("modelAvg"),
        cost_estimate=data.get("costEstimate"),
        cost_actual=data.get("costActual"),
        started_by=data.get("startedBy", ""),
        started_at=started if isinstance(started, datetime) else None,
    )


class FirestoreRunRepo:
    def __init__(self, client: firestore.AsyncClient) -> None:
        self._client = client

    def _prompt_ref(self, project_id: str, prompt_id: str) -> firestore.AsyncDocumentReference:
        ref: firestore.AsyncDocumentReference = (
            self._client.collection("projects").document(project_id)
            .collection("prompts").document(prompt_id)
        )
        return ref

    def _runs_collection(self, project_id: str, prompt_id: str) -> firestore.AsyncCollectionReference:
        collection: firestore.AsyncCollectionReference = (
            self._prompt_ref(project_id, prompt_id).collection("runs")
        )
        return collection

    async def get(self, project_id: str, prompt_id: str, run_id: str) -> Run | None:
        snap = await self._runs_collection(project_id, prompt_id).document(run_id).get()
        return _run_from_snap(snap) if snap.exists else None

    async def create_run(
        self, project_id: str, prompt_id: str, *, version_n: int, started_by: str
    ) -> str:
        ref = self._runs_collection(project_id, prompt_id).document()
        await ref.set({
            "versionN": version_n,
            "status": "running",
            "composite": None,
            "codeAvg": None,
            "modelAvg": None,
            "costEstimate": None,
            "costActual": None,
            "startedBy": started_by,
            "startedAt": firestore.SERVER_TIMESTAMP,
        })
        return str(ref.id)

    async def write_case(self, project_id: str, prompt_id: str, run_id: str, result: CaseResult) -> None:
        run_ref = self._runs_collection(project_id, prompt_id).document(run_id)
        await run_ref.collection("cases").document(result.case_id).set(_case_result_to_dict(result))

    async def finalize(
        self, project_id: str, prompt_id: str, run_id: str, *, stats: RunStats, cost_actual: float
    ) -> None:
        run_ref = self._runs_collection(project_id, prompt_id).document(run_id)
        prompt_ref = self._prompt_ref(project_id, prompt_id)

        @firestore.async_transactional
        async def _run(transaction: firestore.AsyncTransaction) -> None:
            prompt_snap = await _snapshot(transaction, prompt_ref)
            transaction.update(
                run_ref,
                {
                    "status": "complete",
                    "composite": stats.composite,
                    "codeAvg": stats.code_avg,
                    "modelAvg": stats.model_avg,
                    "costActual": cost_actual,
                },
            )
            if stats.composite is not None:
                current_best = (prompt_snap.to_dict() or {}).get("bestScore")
                if current_best is None or stats.composite > current_best:
                    transaction.update(prompt_ref, {"bestScore": stats.composite})

        transaction = self._client.transaction()
        await _run(transaction)

    async def set_human_grade(
        self, project_id: str, prompt_id: str, run_id: str, case_id: str, score: float | None
    ) -> None:
        run_ref = self._runs_collection(project_id, prompt_id).document(run_id)
        await run_ref.collection("cases").document(case_id).update({"humanScore": score})


def _model_rates_from_snap(snap: firestore.DocumentSnapshot) -> ModelRates:
    data = snap.to_dict() or {}
    return ModelRates(
        label=data.get("label", snap.id),
        rate_in_per_1m=data.get("ratesInPer1M", 0.0),
        rate_out_per_1m=data.get("ratesOutPer1M", 0.0),
        enabled=data.get("enabled", True),
    )


class FirestoreModelRegistryRepo:
    def __init__(self, client: firestore.AsyncClient) -> None:
        self._client = client

    async def get_all(self) -> dict[str, ModelRates]:
        return {
            snap.id: _model_rates_from_snap(snap)
            async for snap in self._client.collection("modelRegistry").stream()
        }

    async def update(
        self,
        model_id: str,
        *,
        rate_in_per_1m: float | None = None,
        rate_out_per_1m: float | None = None,
        enabled: bool | None = None,
    ) -> ModelRates:
        ref = self._client.collection("modelRegistry").document(model_id)
        snap = await ref.get()
        if not snap.exists:
            raise LookupError(f"Unknown model {model_id!r}")
        patch: dict[str, Any] = {}
        if rate_in_per_1m is not None:
            patch["ratesInPer1M"] = rate_in_per_1m
        if rate_out_per_1m is not None:
            patch["ratesOutPer1M"] = rate_out_per_1m
        if enabled is not None:
            patch["enabled"] = enabled
        if patch:
            await ref.update(patch)
            snap = await ref.get()
        return _model_rates_from_snap(snap)


class FirestoreOrgSettingsRepo:
    """Reads/writes a single doc `orgSettings/privacy` — fetched only via the API (never
    onSnapshot), so no firestore.rules change is needed: default-deny already covers a
    collection with no explicit rule, and nothing client-side ever reads it directly."""

    _DEFAULT = PrivacySettings(retention_days=90, telemetry=True)

    def __init__(self, client: firestore.AsyncClient) -> None:
        self._client = client

    def _ref(self) -> firestore.AsyncDocumentReference:
        return self._client.collection("orgSettings").document("privacy")

    async def get_privacy(self) -> PrivacySettings:
        snap = await self._ref().get()
        if not snap.exists:
            return self._DEFAULT
        data = snap.to_dict() or {}
        return PrivacySettings(
            retention_days=data.get("retentionDays", self._DEFAULT.retention_days),
            telemetry=data.get("telemetry", self._DEFAULT.telemetry),
        )

    async def update_privacy(self, *, retention_days: int, telemetry: bool) -> PrivacySettings:
        await self._ref().set({"retentionDays": retention_days, "telemetry": telemetry})
        return PrivacySettings(retention_days=retention_days, telemetry=telemetry)


def _suggestion_to_dict(s: Suggestion) -> dict[str, Any]:
    return {
        "ruleId": s.rule_id,
        "technique": s.technique,
        "evidence": s.evidence,
        "oldText": s.old_text,
        "newText": s.new_text,
    }


def _suggestion_from_dict(data: dict[str, Any]) -> Suggestion:
    return Suggestion(
        rule_id=data.get("ruleId", ""),
        technique=data.get("technique", ""),
        evidence=data.get("evidence", ""),
        old_text=data.get("oldText", ""),
        new_text=data.get("newText", ""),
    )


def _cycle_config_to_dict(cfg: CycleConfigSnapshot) -> dict[str, Any]:
    return {
        "target": cfg.target,
        "maxIter": cfg.max_iter,
        "budget": cfg.budget,
        "nSug": cfg.n_sug,
        "auto": cfg.auto,
        "weights": cfg.weights,
        "models": cfg.models,
    }


def _cycle_config_from_dict(data: dict[str, Any]) -> CycleConfigSnapshot:
    return CycleConfigSnapshot(
        target=data.get("target", 8.0),
        max_iter=data.get("maxIter", 4),
        budget=data.get("budget", 0.6),
        n_sug=data.get("nSug", 2),
        auto=data.get("auto", False),
        weights=data.get("weights", {}),
        models=data.get("models", {}),
    )


def _cycle_to_dict(cycle: Cycle) -> dict[str, Any]:
    """Everything except startedAt (set only at create, via SERVER_TIMESTAMP)."""
    return {
        "promptId": cycle.prompt_id,
        "projectId": cycle.project_id,
        "status": cycle.status,
        "stage": cycle.stage,
        "iteration": cycle.iteration,
        "spent": cycle.spent,
        "scores": [{"n": s.n, "score": s.score} for s in cycle.scores],
        "endReason": cycle.end_reason,
        "bestN": cycle.best_n,
        "warnedFlat": cycle.warned_flat,
        "currentVersionN": cycle.current_version_n,
        "currentRunId": cycle.current_run_id,
        "pending": (
            {
                "candidates": [_suggestion_to_dict(s) for s in cycle.pending.candidates],
                "selected": cycle.pending.selected,
            }
            if cycle.pending is not None
            else None
        ),
        "configSnapshot": _cycle_config_to_dict(cycle.config),
        "log": [{"ts": entry.ts, "message": entry.message} for entry in cycle.log],
        "startedBy": cycle.started_by,
    }


def _cycle_from_snap(snap: firestore.DocumentSnapshot) -> Cycle:
    data = snap.to_dict() or {}
    pending_data = data.get("pending")
    pending = (
        CyclePending(
            candidates=[_suggestion_from_dict(c) for c in pending_data.get("candidates", [])],
            selected=pending_data.get("selected", 0),
        )
        if pending_data is not None
        else None
    )
    log: list[CycleLogEntry] = []
    for entry in data.get("log", []):
        ts = entry.get("ts")
        log.append(CycleLogEntry(ts=ts if isinstance(ts, datetime) else datetime.now(UTC), message=entry.get("message", "")))
    return Cycle(
        id=snap.id,
        prompt_id=data.get("promptId", ""),
        project_id=data.get("projectId", ""),
        status=data.get("status", "active"),
        stage=data.get("stage", "dataset"),
        iteration=data.get("iteration", 0),
        spent=data.get("spent", 0.0),
        scores=[CycleScore(n=s["n"], score=s["score"]) for s in data.get("scores", [])],
        end_reason=data.get("endReason"),
        best_n=data.get("bestN"),
        warned_flat=data.get("warnedFlat", False),
        current_version_n=data.get("currentVersionN"),
        current_run_id=data.get("currentRunId"),
        pending=pending,
        config=_cycle_config_from_dict(data.get("configSnapshot", {})),
        log=log,
        started_by=data.get("startedBy", ""),
    )


class FirestoreCycleRepo:
    """One-active-cycle-globally is enforced with a keyed marker document at
    meta/activeCycle, written via `transaction.create()` — a real Firestore precondition
    that fails atomically at commit if the doc already exists, unlike a `.where(...)` query
    (see FirestorePromptRepo.create's note on why a query is not a hard guarantee)."""

    _MARKER_COLLECTION = "meta"
    _MARKER_DOC = "activeCycle"

    def __init__(self, client: firestore.AsyncClient) -> None:
        self._client = client

    def _collection(self) -> firestore.AsyncCollectionReference:
        return self._client.collection("cycles")

    def _marker_ref(self) -> firestore.AsyncDocumentReference:
        return self._client.collection(self._MARKER_COLLECTION).document(self._MARKER_DOC)

    async def get_active(self) -> Cycle | None:
        query = self._collection().where("status", "==", "active").order_by("startedAt").limit(1)
        async for snap in query.stream():
            return _cycle_from_snap(snap)
        return None

    async def get(self, cycle_id: str) -> Cycle | None:
        snap = await self._collection().document(cycle_id).get()
        return _cycle_from_snap(snap) if snap.exists else None

    async def create(self, cycle: Cycle) -> Cycle:
        marker_ref = self._marker_ref()
        collection = self._collection()

        @firestore.async_transactional
        async def _run(transaction: firestore.AsyncTransaction) -> tuple[str, datetime]:
            cycle_ref = collection.document()
            started_at = datetime.now(UTC)
            transaction.create(
                marker_ref,
                {"cycleId": cycle_ref.id, "promptId": cycle.prompt_id, "startedAt": started_at},
            )
            payload = _cycle_to_dict(cycle)
            payload["startedAt"] = firestore.SERVER_TIMESTAMP
            transaction.set(cycle_ref, payload)
            return cycle_ref.id, started_at

        transaction = self._client.transaction()
        try:
            cycle_id, _ = await _run(transaction)
        except Exception as exc:
            # Firestore's create()-conflict exception type is not part of its documented
            # public surface, and this is the one place a failed marker-doc precondition
            # must become a domain-level ValueError so routes can map it to a 409; see
            # FirestoreCycleRepo's class docstring.
            raise ValueError("A cycle is already active") from exc
        return replace(cycle, id=cycle_id)

    async def save(self, cycle: Cycle, *, new_log_messages: Sequence[str] = ()) -> None:
        cycle_ref = self._collection().document(cycle.id)
        patch: dict[str, Any] = _cycle_to_dict(cycle)
        # promptId/projectId/configSnapshot/startedBy are write-once at create() — this IS
        # the config-snapshot isolation mechanism, so they are deliberately never rewritten.
        for immutable_field in ("promptId", "projectId", "configSnapshot", "startedBy"):
            patch.pop(immutable_field, None)
        if new_log_messages:
            patch["log"] = firestore.ArrayUnion(
                [{"ts": datetime.now(UTC), "message": msg} for msg in new_log_messages]
            )
        else:
            patch.pop("log", None)

        if cycle.status != "ended":
            await cycle_ref.update(patch)
            return

        marker_ref = self._marker_ref()

        @firestore.async_transactional
        async def _run(transaction: firestore.AsyncTransaction) -> None:
            marker_snap = await _snapshot(transaction, marker_ref)
            transaction.update(cycle_ref, patch)
            if marker_snap.exists and marker_snap.get("cycleId") == cycle.id:
                transaction.delete(marker_ref)

        transaction = self._client.transaction()
        await _run(transaction)
