from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db.models import TelegramChannel, User
from backend.api.routes_auth import get_current_user, log_audit

router = APIRouter(prefix="/api/telegram-channels", tags=["telegram"])


class ChannelOut(BaseModel):
    id: int
    username: str
    label: Optional[str]
    enabled: bool
    added_at: datetime

    class Config:
        from_attributes = True


class ChannelCreate(BaseModel):
    username: str   # @ChannelName
    label: Optional[str] = None


def _require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required.")
    return current_user


@router.get("", response_model=list[ChannelOut])
def list_channels(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(TelegramChannel).order_by(TelegramChannel.added_at.asc()).all()


@router.post("", response_model=ChannelOut, status_code=201)
def add_channel(
    payload: ChannelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    username = payload.username.strip()
    if not username.startswith("@"):
        username = "@" + username
    if db.query(TelegramChannel).filter(TelegramChannel.username == username).first():
        raise HTTPException(status_code=409, detail="Channel already exists.")
    ch = TelegramChannel(username=username, label=payload.label, enabled=True)
    db.add(ch)
    db.commit()
    db.refresh(ch)
    log_audit(db, current_user, "telegram_channel_added", f"Added channel {username}")
    return ch


@router.patch("/{channel_id}", response_model=ChannelOut)
def toggle_channel(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    ch = db.query(TelegramChannel).filter(TelegramChannel.id == channel_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found.")
    ch.enabled = not ch.enabled
    db.commit()
    db.refresh(ch)
    log_audit(db, current_user, "telegram_channel_toggled", f"{ch.username} → {'enabled' if ch.enabled else 'disabled'}")
    return ch


@router.delete("/{channel_id}")
def delete_channel(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    ch = db.query(TelegramChannel).filter(TelegramChannel.id == channel_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found.")
    log_audit(db, current_user, "telegram_channel_removed", f"Removed {ch.username}")
    db.delete(ch)
    db.commit()
    return {"status": "deleted"}
