import logging
import os
from apscheduler.schedulers.background import BackgroundScheduler
from backend.db.database import SessionLocal
from backend.db.models import Target, Settings, ScanHistory, ScheduledScan
from backend.monitors import paste_monitor, breach_monitor, telegram_monitor, leakcheck_monitor, intelx_monitor, leaklookup_monitor, ctifeeds_monitor
from backend.alerts import email_alert, webhook_alert
from backend.config import SCAN_INTERVAL_HOURS

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler()

SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]

# Scan progress state
scan_status = {
    "running": False,
    "step": "",
    "steps_done": 0,
    "steps_total": 7,
    "last_completed": None,
    "new_alerts": 0,
}

MONITOR_STEPS = [
    ("leaklookup", "Leak-Lookup — searching breach databases…", leaklookup_monitor),
    ("leakcheck",  "LeakCheck — checking breach databases…",    leakcheck_monitor),
    ("breach",     "BreachDirectory — checking password exposure…", breach_monitor),
    ("paste",      "Paste sites — scanning paste dumps…",       paste_monitor),
    ("intelx",     "IntelligenceX — searching dark web records…", intelx_monitor),
    ("telegram",   "Telegram — scanning stealer log channels…", telegram_monitor),
    ("ctifeeds",   "CTI Feeds — checking threat intelligence feeds…", ctifeeds_monitor),
]


def get_scan_status() -> dict:
    return dict(scan_status)


def _disabled_monitors() -> set:
    raw = os.getenv("DISABLED_MONITORS", "")
    return {s.strip().lower() for s in raw.split(",") if s.strip()}


def run_monitors_for_targets(targets, only_monitor: str = None):
    """Run monitors for a specific list of targets only — does NOT reload from DB."""
    from datetime import datetime
    target_ids = [t.id for t in targets]
    disabled = _disabled_monitors()
    steps = [
        (k, l, m) for k, l, m in MONITOR_STEPS
        if (only_monitor is None or k == only_monitor) and k not in disabled
    ]
    label = f"Running {only_monitor}…" if only_monitor else "Initializing…"
    logger.info("Starting scan — target_ids: %s, monitor: %s", target_ids, only_monitor or "all")
    scan_status.update({"running": True, "steps_done": 0, "steps_total": len(steps), "step": label, "new_alerts": 0})
    db = SessionLocal()
    try:
        from backend.db.models import Target as TargetModel
        session_targets = db.query(TargetModel).filter(TargetModel.id.in_(target_ids)).all()

        settings = db.query(Settings).first()
        threshold = settings.min_severity_to_alert if settings else "HIGH"
        threshold_idx = SEVERITY_ORDER.index(threshold) if threshold in SEVERITY_ORDER else 1
        alert_count_before = _count_recent_alerts(db)
        scan_started_at = datetime.utcnow()

        for key, step_label, monitor in steps:
            scan_status["step"] = step_label
            try:
                before = _count_alerts_since(db, scan_started_at)
                monitor.run(db, session_targets)
                after = _count_alerts_since(db, scan_started_at)
                findings = max(after - before, 0)
                for t in session_targets:
                    db.add(ScanHistory(target_id=t.id, monitor=key, findings=findings, status="ok"))
                db.commit()
            except Exception as e:
                logger.error("Monitor %s failed: %s", key, e)
                db.rollback()
                for t in session_targets:
                    db.add(ScanHistory(target_id=t.id, monitor=key, findings=0, status="error", error_msg=str(e)))
                db.commit()
            scan_status["steps_done"] += 1

        if settings:
            scan_status["step"] = "Dispatching alerts…"
            _dispatch_alerts(db, settings, threshold_idx, scan_started_at)

        new_count = _count_recent_alerts(db) - alert_count_before
        scan_status.update({
            "running": False,
            "step": f"Scan complete — {new_count} new finding(s).",
            "last_completed": datetime.utcnow().isoformat(),
            "new_alerts": max(new_count, 0),
        })
    except Exception as e:
        logger.error("Scan failed: %s", e)
        scan_status.update({"running": False, "step": f"Scan failed: {e}"})
    finally:
        db.close()


def run_all_monitors():
    from datetime import datetime, timedelta

    logger.info("Starting scheduled monitor run")
    scan_status.update({"running": True, "steps_done": 0, "step": "Initializing…", "new_alerts": 0})

    db = SessionLocal()
    try:
        targets = db.query(Target).filter(Target.active == True).all()  # noqa: E712
        if not targets:
            logger.info("No active targets configured")
            scan_status.update({"running": False, "step": "No targets configured.", "last_completed": datetime.utcnow().isoformat()})
            return

        disabled = _disabled_monitors()
        active_steps = [(k, l, m) for k, l, m in MONITOR_STEPS if k not in disabled]
        scan_status["steps_total"] = len(active_steps)

        settings = db.query(Settings).first()
        threshold = settings.min_severity_to_alert if settings else "HIGH"
        threshold_idx = SEVERITY_ORDER.index(threshold) if threshold in SEVERITY_ORDER else 1

        alert_count_before = _count_recent_alerts(db)
        scan_started_at = datetime.utcnow()

        for key, label, monitor in active_steps:
            scan_status["step"] = label
            logger.info("Running monitor: %s", key)
            try:
                before = _count_alerts_since(db, scan_started_at)
                monitor.run(db, targets)
                after = _count_alerts_since(db, scan_started_at)
                findings = max(after - before, 0)
                for t in targets:
                    db.add(ScanHistory(target_id=t.id, monitor=key, findings=findings, status="ok"))
                db.commit()
            except Exception as e:
                logger.error("Monitor %s failed: %s", key, e)
                for t in targets:
                    db.add(ScanHistory(target_id=t.id, monitor=key, findings=0, status="error", error_msg=str(e)))
                db.commit()
            scan_status["steps_done"] += 1

        if settings:
            scan_status["step"] = "Dispatching alerts…"
            _dispatch_alerts(db, settings, threshold_idx, scan_started_at)

        new_count = _count_recent_alerts(db) - alert_count_before
        scan_status.update({
            "running": False,
            "step": f"Scan complete — {new_count} new finding(s).",
            "last_completed": datetime.utcnow().isoformat(),
            "new_alerts": max(new_count, 0),
        })
        logger.info("Monitor run complete")
    except Exception as e:
        logger.error("Monitor run failed: %s", e)
        scan_status.update({"running": False, "step": f"Scan failed: {e}"})
    finally:
        db.close()


def _count_recent_alerts(db) -> int:
    from backend.db.models import Alert
    from datetime import datetime, timedelta
    cutoff = datetime.utcnow() - timedelta(minutes=30)
    return db.query(Alert).filter(Alert.created_at >= cutoff).count()


def _count_alerts_since(db, since) -> int:
    from backend.db.models import Alert
    return db.query(Alert).filter(Alert.created_at >= since).count()


def _dispatch_alerts(db, settings: Settings, threshold_idx: int, scan_started_at=None):
    from backend.db.models import Alert
    from datetime import datetime, timedelta

    cutoff = scan_started_at or (datetime.utcnow() - timedelta(minutes=2))
    new_alerts = (
        db.query(Alert)
        .filter(Alert.created_at >= cutoff, Alert.acknowledged == False)  # noqa: E712
        .all()
    )

    from backend.alerts import siem_alert
    from backend.db.models import Target as TargetModel

    import time
    for alert in new_alerts:
        if alert.severity not in SEVERITY_ORDER:
            continue
        alert_idx = SEVERITY_ORDER.index(alert.severity)
        if alert_idx <= threshold_idx:
            email_alert.send_alert(alert, settings)
            time.sleep(1.2)  # Mailtrap free tier: max 1 email/sec
            webhook_alert.send_slack_alert(alert, settings)
        # SIEM push regardless of threshold — let the SIEM filter by severity
        if settings and settings.siem_webhook_url:
            target = db.query(TargetModel).filter(TargetModel.id == alert.target_id).first()
            if target:
                siem_alert.send_siem_alert(alert, settings, target)


def run_retention_purge():
    """Run daily — delete alerts older than settings.alert_retention_days (0 = keep forever)."""
    from datetime import datetime, timedelta
    from backend.db.models import Alert
    db = SessionLocal()
    try:
        settings = db.query(Settings).first()
        days = settings.alert_retention_days if settings else 0
        if not days or days <= 0:
            return
        cutoff = datetime.utcnow() - timedelta(days=days)
        deleted = db.query(Alert).filter(Alert.created_at < cutoff).delete()
        db.commit()
        if deleted:
            logger.info("Retention purge: deleted %d alerts older than %d days", deleted, days)
    except Exception as e:
        logger.error("Retention purge failed: %s", e)
    finally:
        db.close()


def run_scheduled_scans():
    """Called every minute — fire any ScheduledScan whose run_at has passed."""
    from datetime import datetime
    db = SessionLocal()
    try:
        due = (
            db.query(ScheduledScan)
            .filter(ScheduledScan.status == "pending", ScheduledScan.run_at <= datetime.utcnow())
            .all()
        )
        for scan in due:
            scan.status = "running"
            db.commit()
            logger.info("Firing scheduled scan #%d", scan.id)
            import threading
            def _fire(s=scan):
                try:
                    if s.target_id:
                        _db = SessionLocal()
                        try:
                            targets = _db.query(Target).filter(Target.id == s.target_id, Target.active == True).all()  # noqa: E712
                        finally:
                            _db.close()
                        run_monitors_for_targets(targets, only_monitor=s.monitor)
                    else:
                        run_all_monitors()
                    _mark_done(s.id, "done")
                except Exception as e:
                    logger.error("Scheduled scan #%d failed: %s", s.id, e)
                    _mark_done(s.id, "error")
            threading.Thread(target=_fire, daemon=True).start()
    finally:
        db.close()


def _mark_done(scan_id: int, status: str):
    db = SessionLocal()
    try:
        scan = db.query(ScheduledScan).filter(ScheduledScan.id == scan_id).first()
        if scan:
            scan.status = status
            db.commit()
    finally:
        db.close()


def start_scheduler(interval_hours: int = SCAN_INTERVAL_HOURS):
    scheduler.add_job(
        run_all_monitors,
        "interval",
        hours=interval_hours,
        id="monitor_job",
        replace_existing=True,
    )
    scheduler.add_job(
        run_scheduled_scans,
        "interval",
        minutes=1,
        id="scheduled_scans_job",
        replace_existing=True,
    )
    scheduler.add_job(
        run_retention_purge,
        "interval",
        hours=24,
        id="retention_job",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler started — interval: %dh", interval_hours)


def update_interval(hours: int):
    scheduler.reschedule_job("monitor_job", trigger="interval", hours=hours)
    logger.info("Scheduler interval updated to %dh", hours)


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
