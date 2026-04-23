"""
Session management — track active JWT sessions per user.
Each login mints a JWT with a unique jti claim; the jti is stored in UserSession.
On revoke, we flip revoked=True. get_current_user checks this before accepting tokens.
"""
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db.models import UserSession, User
from backend.api.routes_auth import get_current_user, log_audit

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class SessionOut(BaseModel):
    id: int
    token_jti: str
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: datetime
    last_seen: datetime
    revoked: bool

    class Config:
        from_attributes = True


@router.get("", response_model=list[SessionOut])
def list_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(UserSession)
        .filter(UserSession.user_id == current_user.id, UserSession.revoked == False)  # noqa: E712
        .order_by(UserSession.last_seen.desc())
        .all()
    )


@router.delete("/{session_id}")
def revoke_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sess = db.query(UserSession).filter(
        UserSession.id == session_id,
        UserSession.user_id == current_user.id,
    ).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found.")
    sess.revoked = True
    db.commit()
    log_audit(db, current_user, "session_revoked", f"Session #{session_id} revoked")
    return {"status": "revoked"}


@router.delete("")
def revoke_all_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(UserSession).filter(
        UserSession.user_id == current_user.id,
        UserSession.revoked == False,  # noqa: E712
    ).update({"revoked": True})
    db.commit()
    log_audit(db, current_user, "all_sessions_revoked", "All sessions revoked")
    return {"status": "all_revoked"}
