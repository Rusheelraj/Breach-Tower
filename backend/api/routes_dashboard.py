"""
Extended alert routes: assignment, remediation notes, trend data, comparison.
"""
import csv
import io
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from backend.db.database import get_db
from backend.db.models import Alert, Target, User
from backend.api.routes_auth import get_current_user, log_audit

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

VALID_SEVERITIES = {"CRITICAL", "HIGH", "MEDIUM", "LOW"}
VALID_SOURCES = {"leaklookup", "leakcheck", "breach", "paste", "intelx", "telegram", "ctifeeds", "hibp"}


class AlertOut(BaseModel):
    id: int
    target_id: int
    source: str
    data_found: str
    severity: str
    remediation_steps: Optional[str]
    created_at: datetime
    acknowledged: bool

    class Config:
        from_attributes = True


class StatsOut(BaseModel):
    total: int
    critical: int
    high: int
    medium: int
    low: int
    unacknowledged: int


@router.get("", response_model=list[AlertOut])
def list_alerts(
    severity: Optional[str] = None,
    source: Optional[str] = None,
    acknowledged: Optional[bool] = None,
    target_id: Optional[int] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Validate and cap parameters
    if limit > 500:
        limit = 500
    if offset < 0:
        offset = 0
    if severity and severity.upper() not in VALID_SEVERITIES:
        raise HTTPException(status_code=400, detail=f"Invalid severity. Must be one of: {', '.join(VALID_SEVERITIES)}")
    if source and source.lower() not in VALID_SOURCES:
        raise HTTPException(status_code=400, detail=f"Invalid source.")
    if target_id is not None:
        target = db.query(Target).filter(Target.id == target_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="Target not found.")

    query = db.query(Alert)
    if severity:
        query = query.filter(Alert.severity == severity.upper())
    if source:
        query = query.filter(Alert.source == source.lower())
    if acknowledged is not None:
        query = query.filter(Alert.acknowledged == acknowledged)
    if target_id is not None:
        query = query.filter(Alert.target_id == target_id)
    return (
        query.order_by(Alert.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.post("/{alert_id}/ack")
def acknowledge_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.acknowledged = True
    db.commit()
    log_audit(db, current_user, "alert_acknowledged", f"Alert ID {alert_id} acknowledged")
    return {"status": "acknowledged"}


@router.get("/stats", response_model=StatsOut)
def get_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total = db.query(Alert).count()
    unacknowledged = db.query(Alert).filter(Alert.acknowledged == False).count()  # noqa: E712

    severity_counts = (
        db.query(Alert.severity, func.count(Alert.id))
        .group_by(Alert.severity)
        .all()
    )
    counts = {s: c for s, c in severity_counts}

    return StatsOut(
        total=total,
        critical=counts.get("CRITICAL", 0),
        high=counts.get("HIGH", 0),
        medium=counts.get("MEDIUM", 0),
        low=counts.get("LOW", 0),
        unacknowledged=unacknowledged,
    )


@router.get("/export/csv")
def export_alerts_csv(
    severity: Optional[str] = None,
    source: Optional[str] = None,
    acknowledged: Optional[bool] = None,
    target_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if severity and severity.upper() not in VALID_SEVERITIES:
        raise HTTPException(status_code=400, detail="Invalid severity.")
    if source and source.lower() not in VALID_SOURCES:
        raise HTTPException(status_code=400, detail="Invalid source.")

    query = db.query(Alert)
    if severity:
        query = query.filter(Alert.severity == severity.upper())
    if source:
        query = query.filter(Alert.source == source.lower())
    if acknowledged is not None:
        query = query.filter(Alert.acknowledged == acknowledged)
    if target_id is not None:
        query = query.filter(Alert.target_id == target_id)
    alerts = query.order_by(Alert.created_at.desc()).limit(10000).all()

    target_ids = {a.target_id for a in alerts}
    targets = {t.id: t for t in db.query(Target).filter(Target.id.in_(target_ids)).all()}

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["ID", "Target", "Source", "Severity", "Data Found", "Acknowledged", "Created At", "Remediation"])
    for a in alerts:
        t = targets.get(a.target_id)
        label = t.domain or t.email_pattern or str(a.target_id) if t else str(a.target_id)
        writer.writerow([
            a.id, label, a.source, a.severity,
            a.data_found, a.acknowledged,
            a.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            a.remediation_steps or "",
        ])

    log_audit(db, current_user, "alerts_exported", f"CSV export: {len(alerts)} alerts")

    buf.seek(0)
    filename = f"breach-tower-alerts-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.csv"
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
