# api/app/adapters/firestore_repos.py
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from google.cloud import firestore

from app.domain.models import Project, ProjectCfg, User
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
