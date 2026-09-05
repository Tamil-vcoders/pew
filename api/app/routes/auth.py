# api/app/routes/auth.py
from fastapi import APIRouter, Depends

from app.deps import current_user
from app.domain.models import User

router = APIRouter()


@router.get("/me")
async def get_me(user: User = Depends(current_user)) -> dict[str, str]:
    return {
        "uid": user.uid,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "createdAt": user.created_at.isoformat(),
    }
