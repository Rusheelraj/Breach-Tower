"""
Extended alert routes: assignment, remediation notes, trend data, comparison.
"""
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from backend.db.database import get_db
from backend.db.models import Alert, User
from backend.api.routes_auth import get_current_user

router = APIRouter(prefix="/api/alerts", tags=["alerts-extended"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class AssignPayload(BaseModel):
    user_id: Optional[int] = None   # null = unassign


class NotePayload(BaseModel):
    note: str


class TrendPoint(BaseModel):
    date: str
    critical: int
    high: int
    medium: int
    low: int
    total: int


class ComparisonOut(BaseModel):
    current_total: int
    previous_total: int
    current_critical: int
    previous_critical: int
    current_high: int
    previous_high: int
    delta_total: int
    delta_critical: int
    delta_high: int


# ── Assignment ────────────────────────────────────────────────────────────────

@router.post("/{alert_id}/assign")
def assign_alert(
    alert_id: int,
    payload: AssignPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    if payload.user_id is not None:
        user = db.query(User).filter(User.id == payload.user_id, User.active == True).first()  # noqa: E712
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        alert.assigned_to_id = user.id
        alert.assigned_at = datetime.utcnow()
    else:
        alert.assigned_to_id = None
        alert.assigned_at = None

    db.commit()
    db.refresh(alert)
    return {
        "alert_id": alert_id,
        "assigned_to_id": alert.assigned_to_id,
        "assigned_to_name": alert.assigned_to.name if alert.assigned_to else None,
        "assigned_at": alert.assigned_at,
    }


# ── Remediation notes ─────────────────────────────────────────────────────────

@router.post("/{alert_id}/note")
def set_note(
    alert_id: int,
    payload: NotePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.remediation_note = payload.note.strip()
    alert.note_updated_at = datetime.utcnow()
    alert.note_updated_by = current_user.email
    db.commit()
    db.refresh(alert)
    return {
        "alert_id": alert_id,
        "remediation_note": alert.remediation_note,
        "note_updated_at": alert.note_updated_at,
        "note_updated_by": alert.note_updated_by,
    }


@router.delete("/{alert_id}/note")
def clear_note(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.remediation_note = None
    alert.note_updated_at = None
    alert.note_updated_by = None
    db.commit()
    return {"status": "cleared"}


# ── Trend data ────────────────────────────────────────────────────────────────

@router.get("/trends", response_model=list[TrendPoint])
def get_trends(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return daily alert counts for the last N days, grouped by severity."""
    since = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(
            func.date(Alert.created_at).label("day"),
            Alert.severity,
            func.count(Alert.id).label("cnt"),
        )
        .filter(Alert.created_at >= since)
        .group_by(func.date(Alert.created_at), Alert.severity)
        .order_by(func.date(Alert.created_at))
        .all()
    )

    # Build a day → {sev: count} map
    day_map: dict[str, dict] = {}
    for row in rows:
        day_str = str(row.day)
        if day_str not in day_map:
            day_map[day_str] = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        sev = row.severity.lower() if row.severity else "low"
        if sev in day_map[day_str]:
            day_map[day_str][sev] = row.cnt

    # Fill every day in range (even days with 0 alerts)
    result = []
    for i in range(days):
        day = (datetime.utcnow() - timedelta(days=days - 1 - i)).strftime("%Y-%m-%d")
        counts = day_map.get(day, {"critical": 0, "high": 0, "medium": 0, "low": 0})
        result.append(TrendPoint(
            date=day,
            critical=counts["critical"],
            high=counts["high"],
            medium=counts["medium"],
            low=counts["low"],
            total=counts["critical"] + counts["high"] + counts["medium"] + counts["low"],
        ))
    return result


# ── Comparison (this week vs last week, or this month vs last) ────────────────

@router.get("/comparison", response_model=ComparisonOut)
def get_comparison(
    period: str = "week",   # "week" | "month"
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.utcnow()
    if period == "month":
        delta = timedelta(days=30)
    else:
        delta = timedelta(days=7)

    current_start  = now - delta
    previous_start = now - delta * 2
    previous_end   = current_start

    def counts(start, end):
        rows = (
            db.query(Alert.severity, func.count(Alert.id))
            .filter(Alert.created_at >= start, Alert.created_at < end)
            .group_by(Alert.severity)
            .all()
        )
        m = {s.upper(): c for s, c in rows}
        return {
            "total":    sum(m.values()),
            "critical": m.get("CRITICAL", 0),
            "high":     m.get("HIGH", 0),
        }

    cur  = counts(current_start, now)
    prev = counts(previous_start, previous_end)

    return ComparisonOut(
        current_total=cur["total"],
        previous_total=prev["total"],
        current_critical=cur["critical"],
        previous_critical=prev["critical"],
        current_high=cur["high"],
        previous_high=prev["high"],
        delta_total=cur["total"] - prev["total"],
        delta_critical=cur["critical"] - prev["critical"],
        delta_high=cur["high"] - prev["high"],
    )
