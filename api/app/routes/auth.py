# api/app/routes/auth.py
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.deps import current_user, get_audit_repo, get_user_repo
from app.domain.models import User
from app.ports.repos import AuditRepo, UserRepo
from app.services.account import delete_own_account

router = APIRouter()


class UpdateMeBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)


def _serialize(user: User) -> dict[str, str]:
    return {
        "uid": user.uid,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "createdAt": user.created_at.isoformat(),
    }


@router.get("/me")
async def get_me(user: User = Depends(current_user)) -> dict[str, str]:
    return _serialize(user)


@router.patch("/me")
async def update_me(
    body: UpdateMeBody,
    user: User = Depends(current_user),
    users: UserRepo = Depends(get_user_repo),
) -> dict[str, str]:
    # Name changes aren't in AC-18.1's list of audited change types — no audit entry here.
    updated = await users.update_name(user.uid, body.name)
    return _serialize(updated)


@router.delete("/me", status_code=204)
async def delete_me(
    user: User = Depends(current_user),
    users: UserRepo = Depends(get_user_repo),
    audit: AuditRepo = Depends(get_audit_repo),
) -> None:
    await delete_own_account(user, users=users, audit=audit)
