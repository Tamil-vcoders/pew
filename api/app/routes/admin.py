# api/app/routes/admin.py
"""Admin API surface (devspec §2 of the Phase 5 plan) — global settings and member/audit
administration. Role gates follow devspec Appendix A / the permission matrix exactly; see
each route's `require(...)` for the specific threshold.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.deps import (
    current_user,
    get_audit_repo,
    get_model_registry_repo,
    get_org_settings_repo,
    get_user_repo,
    require,
)
from app.domain.models import AuditEntry, ModelRates, PrivacySettings, User
from app.ports.repos import AuditRepo, ModelRegistryRepo, OrgSettingsRepo, UserRepo
from app.services.admin import change_member_role

router = APIRouter(prefix="/admin", tags=["admin"])


class ModelRegistryPatchBody(BaseModel):
    model_id: str = Field(min_length=1, alias="modelId")
    rate_in_per_1m: float | None = Field(default=None, ge=0, alias="rateInPer1M")
    rate_out_per_1m: float | None = Field(default=None, ge=0, alias="rateOutPer1M")
    enabled: bool | None = None

    model_config = {"populate_by_name": True}


class PrivacyPatchBody(BaseModel):
    retention_days: int = Field(ge=1, alias="retentionDays")
    telemetry: bool

    model_config = {"populate_by_name": True}


class RoleChangeBody(BaseModel):
    role: str = Field(min_length=1)


def _rates_dict(model_id: str, rates: ModelRates) -> dict[str, object]:
    return {
        "modelId": model_id,
        "label": rates.label,
        "rateInPer1M": rates.rate_in_per_1m,
        "rateOutPer1M": rates.rate_out_per_1m,
        "enabled": rates.enabled,
    }


def _privacy_dict(privacy: PrivacySettings) -> dict[str, object]:
    return {"retentionDays": privacy.retention_days, "telemetry": privacy.telemetry}


def _user_dict(user: User) -> dict[str, object]:
    return {
        "uid": user.uid, "email": user.email, "name": user.name,
        "role": user.role, "createdAt": user.created_at.isoformat(),
    }


def _audit_dict(entry: AuditEntry) -> dict[str, object]:
    return {
        "id": entry.id, "actor": entry.actor, "action": entry.action, "subject": entry.subject,
        "before": entry.before, "after": entry.after, "ts": entry.ts.isoformat(),
    }


@router.get("/model-registry", dependencies=[Depends(require("viewer"))])
async def get_model_registry(
    registry: ModelRegistryRepo = Depends(get_model_registry_repo),
) -> dict[str, object]:
    return {model_id: _rates_dict(model_id, rates) for model_id, rates in (await registry.get_all()).items()}


@router.patch("/model-registry", dependencies=[Depends(require("maintainer"))])
async def patch_model_registry(
    body: ModelRegistryPatchBody, registry: ModelRegistryRepo = Depends(get_model_registry_repo)
) -> dict[str, object]:
    try:
        updated = await registry.update(
            body.model_id, rate_in_per_1m=body.rate_in_per_1m,
            rate_out_per_1m=body.rate_out_per_1m, enabled=body.enabled,
        )
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    return _rates_dict(body.model_id, updated)


@router.get("/privacy", dependencies=[Depends(require("viewer"))])
async def get_privacy(org_settings: OrgSettingsRepo = Depends(get_org_settings_repo)) -> dict[str, object]:
    return _privacy_dict(await org_settings.get_privacy())


@router.patch("/privacy", dependencies=[Depends(require("administrator"))])
async def patch_privacy(
    body: PrivacyPatchBody, org_settings: OrgSettingsRepo = Depends(get_org_settings_repo)
) -> dict[str, object]:
    updated = await org_settings.update_privacy(retention_days=body.retention_days, telemetry=body.telemetry)
    return _privacy_dict(updated)


@router.get("/members", dependencies=[Depends(require("administrator"))])
async def list_members(users: UserRepo = Depends(get_user_repo)) -> list[dict[str, object]]:
    return [_user_dict(u) for u in await users.list_all()]


@router.put("/members/{uid}/role", dependencies=[Depends(require("administrator"))])
async def set_member_role(
    uid: str,
    body: RoleChangeBody,
    actor: User = Depends(current_user),
    users: UserRepo = Depends(get_user_repo),
    audit: AuditRepo = Depends(get_audit_repo),
) -> dict[str, object]:
    try:
        updated = await change_member_role(
            target_uid=uid, new_role=body.role, actor=actor, users=users, audit=audit
        )
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return _user_dict(updated)


@router.get("/audit", dependencies=[Depends(require("administrator"))])
async def list_audit(audit: AuditRepo = Depends(get_audit_repo)) -> list[dict[str, object]]:
    return [_audit_dict(entry) for entry in await audit.list_all()]
