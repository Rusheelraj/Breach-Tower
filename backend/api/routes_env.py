import os
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from backend.db.database import get_db
from backend.db.models import User
from backend.api.routes_auth import get_current_user
from sqlalchemy.orm import Session


def _require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required.")
    return current_user

router = APIRouter(prefix="/api/env", tags=["env"])

# Resolve .env relative to this file's location (backend/api/ -> project root)
ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"

# Keys exposed through this API (DATABASE_URL and DB_PASSWORD are excluded — infra only)
ENV_KEYS = [
    "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "ALERT_EMAIL",
    "SLACK_WEBHOOK",
    "LEAKLOOKUP_API_KEY", "LEAKCHECK_API_KEY", "INTELX_API_KEY", "BREACH_DIRECTORY_KEY",
    "TELEGRAM_API_ID", "TELEGRAM_API_HASH",
    "SCAN_INTERVAL_HOURS",
    "DISABLED_MONITORS",
]


def _read_env() -> dict[str, str]:
    """Parse .env file into a dict, returning only keys in ENV_KEYS."""
    result = {k: "" for k in ENV_KEYS}
    if not ENV_PATH.exists():
        return result
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if key in ENV_KEYS:
            result[key] = value
    return result


def _write_env(updates: dict[str, str]) -> None:
    """
    Write updates back into .env, preserving all existing lines/comments.
    Keys not present in the file yet are appended.
    """
    if ENV_PATH.exists():
        lines = ENV_PATH.read_text(encoding="utf-8").splitlines()
    else:
        lines = []

    written = set()
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("#") or "=" not in stripped:
            new_lines.append(line)
            continue
        key = stripped.split("=", 1)[0].strip()
        if key in updates:
            if key not in written:
                # Write updated value only on first occurrence; skip duplicates
                new_lines.append(f"{key}={updates[key]}")
                written.add(key)
            # else: drop the duplicate line entirely
        else:
            new_lines.append(line)

    # Append any keys that weren't in the file yet
    for key, value in updates.items():
        if key not in written:
            new_lines.append(f"{key}={value}")

    ENV_PATH.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


class EnvOut(BaseModel):
    SMTP_HOST: str = ""
    SMTP_PORT: str = ""
    SMTP_USER: str = ""
    SMTP_PASS: str = ""
    ALERT_EMAIL: str = ""
    SLACK_WEBHOOK: str = ""
    LEAKLOOKUP_API_KEY: str = ""
    LEAKCHECK_API_KEY: str = ""
    INTELX_API_KEY: str = ""
    BREACH_DIRECTORY_KEY: str = ""
    TELEGRAM_API_ID: str = ""
    TELEGRAM_API_HASH: str = ""
    SCAN_INTERVAL_HOURS: str = ""
    DISABLED_MONITORS: str = ""  # comma-separated list e.g. "breach,telegram"


class EnvUpdate(BaseModel):
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: Optional[str] = None
    SMTP_USER: Optional[str] = None
    SMTP_PASS: Optional[str] = None
    ALERT_EMAIL: Optional[str] = None
    SLACK_WEBHOOK: Optional[str] = None
    LEAKLOOKUP_API_KEY: Optional[str] = None
    LEAKCHECK_API_KEY: Optional[str] = None
    INTELX_API_KEY: Optional[str] = None
    BREACH_DIRECTORY_KEY: Optional[str] = None
    TELEGRAM_API_ID: Optional[str] = None
    TELEGRAM_API_HASH: Optional[str] = None
    SCAN_INTERVAL_HOURS: Optional[str] = None
    DISABLED_MONITORS: Optional[str] = None


@router.get("", response_model=EnvOut)
def get_env(current_user: User = Depends(_require_admin)):
    try:
        data = _read_env()
        return EnvOut(**data)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to read configuration.")


def _sanitize_value(value: str) -> str:
    """Reject values containing newlines or null bytes that could corrupt .env."""
    if any(c in value for c in ("\n", "\r", "\x00")):
        raise HTTPException(status_code=400, detail="Invalid character in configuration value.")
    return value.strip()


@router.post("", response_model=EnvOut)
def update_env(payload: EnvUpdate, current_user: User = Depends(_require_admin)):
    try:
        updates = {k: _sanitize_value(v) for k, v in payload.model_dump().items() if v is not None}
        _write_env(updates)
        for key, value in updates.items():
            os.environ[key] = value
        return EnvOut(**_read_env())
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to update configuration.")
