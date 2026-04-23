from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from backend.db.database import get_db
from backend.db.models import Target, ScanHistory, User
from backend.api.routes_auth import get_current_user

router = APIRouter(prefix="/api/targets", tags=["targets"])


class TargetCreate(BaseModel):
    domain: Optional[str] = None
    email_pattern: Optional[str] = None


class TargetOut(BaseModel):
    id: int
    domain: Optional[str]
    email_pattern: Optional[str]
    active: bool
    added_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=list[TargetOut])
def list_targets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Target).filter(Target.active == True).all()  # noqa: E712


@router.post("", response_model=TargetOut, status_code=201)
def add_target(
    payload: TargetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required.")
    if not payload.domain and not payload.email_pattern:
        raise HTTPException(status_code=400, detail="Provide domain or email_pattern")

    target = Target(
        domain=payload.domain.lower().strip() if payload.domain else None,
        email_pattern=payload.email_pattern.lower().strip() if payload.email_pattern else None,
    )
    db.add(target)
    db.commit()
    db.refresh(target)
    return target


@router.delete("/{target_id}")
def delete_target(
    target_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required.")
    target = db.query(Target).filter(Target.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    target.active = False
    db.commit()
    return {"status": "removed"}


@router.get("/{target_id}/stats")
def target_stats(
    target_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import func
    from backend.db.models import Alert

    rows = (
        db.query(Alert.source, Alert.severity, func.count(Alert.id).label("count"))
        .filter(Alert.target_id == target_id)
        .group_by(Alert.source, Alert.severity)
        .all()
    )

    last_scanned_rows = (
        db.query(Alert.source, func.max(Alert.created_at).label("last_seen"))
        .filter(Alert.target_id == target_id)
        .group_by(Alert.source)
        .all()
    )
    last_scanned = {src: ts.isoformat() for src, ts in last_scanned_rows if ts}

    sources: dict = {}
    total = 0
    for source, severity, count in rows:
        if source not in sources:
            sources[source] = {"total": 0, "last_scanned": last_scanned.get(source)}
        sources[source][severity] = count
        sources[source]["total"] += count
        total += count

    return {"target_id": target_id, "total": total, "by_source": sources}


class ScanHistoryOut(BaseModel):
    id: int
    target_id: int
    monitor: Optional[str]
    findings: int
    status: str
    error_msg: Optional[str]
    ran_at: datetime

    class Config:
        from_attributes = True


@router.get("/{target_id}/scan-history", response_model=list[ScanHistoryOut])
def get_scan_history(
    target_id: int,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if limit > 200:
        limit = 200
    target = db.query(Target).filter(Target.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    return (
        db.query(ScanHistory)
        .filter(ScanHistory.target_id == target_id)
        .order_by(ScanHistory.ran_at.desc())
        .limit(limit)
        .all()
    )
