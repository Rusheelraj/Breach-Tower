import asyncio
import os
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db.models import TelegramChannel, User
from backend.api.routes_auth import get_current_user, log_audit
from backend.config import TELEGRAM_API_ID, TELEGRAM_API_HASH

router = APIRouter(prefix="/api/telegram-channels", tags=["telegram"])
auth_router = APIRouter(prefix="/api/telegram", tags=["telegram"])

SESSION_FILE = "breachtower_session.session"

# In-memory store for the pending auth client (one at a time)
_pending_auth: dict = {}  # keys: "client", "phone_code_hash"


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


# ── Telegram Session Auth ──────────────────────────────────────────────────────

class PhoneRequest(BaseModel):
    phone: str


class CodeRequest(BaseModel):
    phone: str
    code: str


@auth_router.get("/auth/status")
def telegram_auth_status(current_user: User = Depends(_require_admin)):
    """Check whether a valid Telegram session file exists."""
    authenticated = os.path.exists(SESSION_FILE) and os.path.getsize(SESSION_FILE) > 0
    has_credentials = bool(TELEGRAM_API_ID and TELEGRAM_API_HASH)
    return {
        "authenticated": authenticated,
        "has_credentials": has_credentials,
        "session_file": SESSION_FILE,
    }


@auth_router.post("/auth/send-code")
async def telegram_send_code(
    payload: PhoneRequest,
    current_user: User = Depends(_require_admin),
):
    """Send Telegram login code to the given phone number."""
    if not TELEGRAM_API_ID or not TELEGRAM_API_HASH:
        raise HTTPException(status_code=400, detail="TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in .env first.")

    try:
        from telethon import TelegramClient
    except ImportError:
        raise HTTPException(status_code=500, detail="telethon not installed. Run: pip install telethon")

    # Clean up any previous pending auth
    if _pending_auth.get("client"):
        try:
            await _pending_auth["client"].disconnect()
        except Exception:
            pass
        _pending_auth.clear()

    client = TelegramClient(SESSION_FILE, TELEGRAM_API_ID, TELEGRAM_API_HASH)
    await client.connect()

    try:
        result = await client.send_code_request(payload.phone)
        _pending_auth["client"] = client
        _pending_auth["phone"] = payload.phone
        _pending_auth["phone_code_hash"] = result.phone_code_hash
        return {"status": "code_sent", "message": f"Code sent to {payload.phone}"}
    except Exception as e:
        await client.disconnect()
        _pending_auth.clear()
        raise HTTPException(status_code=400, detail=str(e))


@auth_router.post("/auth/verify-code")
async def telegram_verify_code(
    payload: CodeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    """Submit the received code to complete Telegram authentication."""
    if not _pending_auth.get("client"):
        raise HTTPException(status_code=400, detail="No pending auth session. Send phone number first.")

    client = _pending_auth["client"]
    phone_code_hash = _pending_auth["phone_code_hash"]

    try:
        await client.sign_in(
            phone=payload.phone,
            code=payload.code,
            phone_code_hash=phone_code_hash,
        )
        me = await client.get_me()
        await client.disconnect()
        _pending_auth.clear()

        name = f"{me.first_name or ''} (@{me.username or 'unknown'})".strip()
        log_audit(db, current_user, "telegram_authenticated", f"Authenticated as {name}")
        return {
            "status": "authenticated",
            "user": name,
            "message": f"Authenticated as {name}. Telegram monitor is now active.",
        }
    except Exception as e:
        err = str(e)
        # Don't disconnect on wrong code — let user retry
        if "PHONE_CODE_INVALID" in err or "CODE_INVALID" in err:
            raise HTTPException(status_code=400, detail="Invalid code. Please try again.")
        await client.disconnect()
        _pending_auth.clear()
        raise HTTPException(status_code=400, detail=err)


@auth_router.delete("/auth/session")
async def telegram_revoke_session(
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    """Delete the Telegram session file (de-authenticate)."""
    if _pending_auth.get("client"):
        try:
            await _pending_auth["client"].disconnect()
        except Exception:
            pass
        _pending_auth.clear()

    if os.path.exists(SESSION_FILE):
        os.remove(SESSION_FILE)
        log_audit(db, current_user, "telegram_session_revoked", "Telegram session file deleted")
        return {"status": "revoked", "message": "Telegram session deleted. Monitor will skip until re-authenticated."}
    return {"status": "not_found", "message": "No session file found."}
