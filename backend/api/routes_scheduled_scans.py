from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db.models import ScheduledScan, Target, User
from backend.api.routes_auth import get_current_user, log_audit

router = APIRouter(prefix="/api/scheduled-scans", tags=["scheduled-scans"])


class ScheduledScanOut(BaseModel):
    id: int
    run_at: datetime
    target_id: Optional[int]
    monitor: Optional[str]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class ScheduledScanCreate(BaseModel):
    run_at: datetime
    target_id: Optional[int] = None
    monitor: Optional[str] = None


def _require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required.")
    return current_user


@router.get("", response_model=list[ScheduledScanOut])
def list_scheduled(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(ScheduledScan)
        .filter(ScheduledScan.status.in_(["pending", "running"]))
        .order_by(ScheduledScan.run_at.asc())
        .all()
    )


@router.post("", response_model=ScheduledScanOut, status_code=201)
def schedule_scan(
    payload: ScheduledScanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    now_utc = datetime.now(timezone.utc)
    run_at = payload.run_at if payload.run_at.tzinfo else payload.run_at.replace(tzinfo=timezone.utc)
    if run_at <= now_utc:
        raise HTTPException(status_code=400, detail="run_at must be in the future.")
    if payload.target_id:
        if not db.query(Target).filter(Target.id == payload.target_id).first():
            raise HTTPException(status_code=404, detail="Target not found.")
    scan = ScheduledScan(
        run_at=run_at.replace(tzinfo=None),
        target_id=payload.target_id,
        monitor=payload.monitor,
        status="pending",
        created_by=current_user.id,
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)
    log_audit(db, current_user, "scan_scheduled", f"Scan scheduled for {payload.run_at.isoformat()}")
    return scan


@router.delete("/{scan_id}")
def cancel_scan(
    scan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    scan = db.query(ScheduledScan).filter(ScheduledScan.id == scan_id, ScheduledScan.status == "pending").first()
    if not scan:
        raise HTTPException(status_code=404, detail="Pending scan not found.")
    scan.status = "cancelled"
    db.commit()
    log_audit(db, current_user, "scan_cancelled", f"Cancelled scheduled scan #{scan_id}")
    return {"status": "cancelled"}
