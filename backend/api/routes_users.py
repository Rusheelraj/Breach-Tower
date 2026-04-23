from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db.models import User, AuditLog
from backend.api.routes_auth import get_current_user

router = APIRouter(prefix="/api/users", tags=["users"])


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    sso_provider: Optional[str]
    active: bool
    created_at: datetime
    last_login: Optional[datetime]

    class Config:
        from_attributes = True


class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    active: Optional[bool] = None


def _require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required.")
    return current_user


def _audit(db: Session, user: User, action: str, detail: str = ""):
    db.add(AuditLog(user_id=user.id, user_email=user.email, action=action, detail=detail))
    db.commit()


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    return db.query(User).order_by(User.created_at.asc()).all()


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UpdateUserRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    VALID_ROLES = {"admin", "analyst"}

    # Validate role value
    if payload.role is not None and payload.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {', '.join(VALID_ROLES)}")

    # Prevent demoting the only admin
    if payload.role and payload.role != "admin" and target.role == "admin":
        admin_count = db.query(User).filter(User.role == "admin", User.active == True).count()  # noqa: E712
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the only admin account.")

    changes = []
    if payload.role is not None and payload.role != target.role:
        changes.append(f"role: {target.role} → {payload.role}")
        target.role = payload.role
    if payload.active is not None and payload.active != target.active:
        changes.append(f"active: {target.active} → {payload.active}")
        target.active = payload.active

    db.commit()
    db.refresh(target)

    if changes:
        _audit(db, current_user, "user_updated", f"User {target.email}: {'; '.join(changes)}")

    return target


@router.delete("/{user_id}")
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account.")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    # Prevent deactivating the last admin account
    if target.role == "admin" and target.active:
        admin_count = db.query(User).filter(User.role == "admin", User.active == True).count()  # noqa: E712
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot deactivate the only admin account.")
    target.active = False
    db.commit()
    _audit(db, current_user, "user_deactivated", f"Deactivated {target.email}")
    return {"status": "deactivated"}
