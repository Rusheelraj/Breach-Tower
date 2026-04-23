"""
Granular report data endpoint — per-target breakdown with source/severity drill-down.
"""
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.db.database import get_db
from backend.db.models import Alert, Target, User
from backend.api.routes_auth import get_current_user

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/full")
def full_report(
    days30: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns everything the frontend needs to render the executive PDF report:
    - global stats
    - 30/60/90-day trend arrays
    - this-week and this-month comparisons
    - per-target breakdown: alert count, by-source counts, by-severity counts,
      sample findings, websites breached (parsed from data_found)
    """
    now = datetime.utcnow()

    # ── global stats ──────────────────────────────────────────────────────────
    total = db.query(Alert).count()
    unacked = db.query(Alert).filter(Alert.acknowledged == False).count()  # noqa: E712
    sev_rows = db.query(Alert.severity, func.count(Alert.id)).group_by(Alert.severity).all()
    sev_map = {s: c for s, c in sev_rows}
    global_stats = {
        "total": total,
        "critical": sev_map.get("CRITICAL", 0),
        "high":     sev_map.get("HIGH",     0),
        "medium":   sev_map.get("MEDIUM",   0),
        "low":      sev_map.get("LOW",       0),
        "unacknowledged": unacked,
    }

    # ── trend helper ──────────────────────────────────────────────────────────
    def build_trend(days: int):
        since = now - timedelta(days=days)
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
        day_map = {}
        for row in rows:
            ds = str(row.day)
            if ds not in day_map:
                day_map[ds] = {"critical": 0, "high": 0, "medium": 0, "low": 0}
            sev = (row.severity or "low").lower()
            if sev in day_map[ds]:
                day_map[ds][sev] = row.cnt
        result = []
        for i in range(days):
            day = (now - timedelta(days=days - 1 - i)).strftime("%Y-%m-%d")
            c = day_map.get(day, {"critical": 0, "high": 0, "medium": 0, "low": 0})
            result.append({"date": day, "critical": c["critical"], "high": c["high"],
                           "medium": c["medium"], "low": c["low"],
                           "total": c["critical"] + c["high"] + c["medium"] + c["low"]})
        return result

    trends = {
        "30": build_trend(30),
        "60": build_trend(60),
        "90": build_trend(90),
    }

    # ── comparison helper ─────────────────────────────────────────────────────
    def build_comparison(delta: timedelta):
        cur_start  = now - delta
        prev_start = now - delta * 2
        prev_end   = cur_start

        def period_counts(start, end):
            rows = (
                db.query(Alert.severity, func.count(Alert.id))
                .filter(Alert.created_at >= start, Alert.created_at < end)
                .group_by(Alert.severity)
                .all()
            )
            m = {s.upper(): c for s, c in rows}
            return {"total": sum(m.values()), "critical": m.get("CRITICAL", 0), "high": m.get("HIGH", 0)}

        cur  = period_counts(cur_start, now)
        prev = period_counts(prev_start, prev_end)
        return {
            "current_total":    cur["total"],
            "previous_total":   prev["total"],
            "current_critical": cur["critical"],
            "previous_critical":prev["critical"],
            "current_high":     cur["high"],
            "previous_high":    prev["high"],
            "delta_total":      cur["total"]    - prev["total"],
            "delta_critical":   cur["critical"] - prev["critical"],
            "delta_high":       cur["high"]     - prev["high"],
        }

    comparisons = {
        "week":  build_comparison(timedelta(days=7)),
        "month": build_comparison(timedelta(days=30)),
    }

    # ── per-target breakdown ──────────────────────────────────────────────────
    targets = db.query(Target).filter(Target.active == True).all()  # noqa: E712

    target_reports = []
    for t in targets:
        label = t.domain or t.email_pattern or f"Target #{t.id}"

        # all alerts for this target
        alerts = (
            db.query(Alert)
            .filter(Alert.target_id == t.id)
            .order_by(Alert.created_at.desc())
            .all()
        )
        if not alerts:
            continue

        # severity breakdown
        sev_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for a in alerts:
            key = (a.severity or "LOW").upper()
            sev_counts[key] = sev_counts.get(key, 0) + 1

        # source breakdown
        source_map = {}
        for a in alerts:
            src = a.source or "unknown"
            if src not in source_map:
                source_map[src] = {"total": 0, "critical": 0, "high": 0, "medium": 0, "low": 0, "samples": []}
            source_map[src]["total"] += 1
            sev_key = (a.severity or "LOW").lower()
            source_map[src][sev_key] = source_map[src].get(sev_key, 0) + 1
            # keep up to 3 sample findings per source
            if len(source_map[src]["samples"]) < 3:
                source_map[src]["samples"].append({
                    "id":          a.id,
                    "data_found":  a.data_found,
                    "severity":    a.severity,
                    "created_at":  a.created_at.isoformat(),
                    "acknowledged":a.acknowledged,
                })

        # parse breached websites from data_found field
        # data_found often contains "email@domain.com found in breach: website.com"
        # or "username:password from site.com" — we extract any domain-like tokens
        import re
        website_set = set()
        website_pattern = re.compile(
            r'(?:breach[:\s]+|found\s+(?:in|at)[:\s]+|from[:\s]+|site[:\s]+|source[:\s]+)'
            r'([a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+)',
            re.IGNORECASE
        )
        domain_pattern = re.compile(
            r'\b([a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?'
            r'(?:\.[a-zA-Z]{2,}){1,3})\b'
        )
        for a in alerts:
            text = (a.data_found or "") + " " + (a.raw_data or "")
            # try explicit breach pattern first
            for m in website_pattern.finditer(text):
                w = m.group(1).lower()
                if w and "." in w and not w.startswith(label.lstrip("@")):
                    website_set.add(w)
            # fallback: any domain-like token that isn't the target itself
            if not website_set:
                for m in domain_pattern.finditer(text):
                    w = m.group(1).lower()
                    tld_exclusions = {"com", "org", "net", "edu", "gov", "io"}
                    if (w and "." in w and w not in tld_exclusions
                            and label not in w and w not in label):
                        website_set.add(w)

        # 30-day trend for this target
        since30 = now - timedelta(days=30)
        trend_rows = (
            db.query(
                func.date(Alert.created_at).label("day"),
                func.count(Alert.id).label("cnt"),
            )
            .filter(Alert.target_id == t.id, Alert.created_at >= since30)
            .group_by(func.date(Alert.created_at))
            .order_by(func.date(Alert.created_at))
            .all()
        )
        target_trend = {str(r.day): r.cnt for r in trend_rows}

        open_count = sum(1 for a in alerts if not a.acknowledged)
        first_seen = min(a.created_at for a in alerts).strftime("%Y-%m-%d")
        last_seen  = max(a.created_at for a in alerts).strftime("%Y-%m-%d")

        target_reports.append({
            "id":            t.id,
            "label":         label,
            "domain":        t.domain,
            "email_pattern": t.email_pattern,
            "total_alerts":  len(alerts),
            "open_alerts":   open_count,
            "first_seen":    first_seen,
            "last_seen":     last_seen,
            "severity":      sev_counts,
            "by_source":     source_map,
            "websites_breached": sorted(website_set)[:20],
            "trend_30d":     target_trend,
        })

    # sort targets: most alerts first
    target_reports.sort(key=lambda x: x["total_alerts"], reverse=True)

    return {
        "generated_at":  now.isoformat(),
        "global_stats":  global_stats,
        "trends":        trends,
        "comparisons":   comparisons,
        "targets":       target_reports,
    }
