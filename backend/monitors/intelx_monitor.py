"""
IntelligenceX (intelx.io) free tier — searches breaches, pastes, darkweb.
Free API key: https://intelx.io/account?tab=developer
Limit: 5 requests/month on free tier (use sparingly).
"""
import time
import logging
import requests
from datetime import datetime
from sqlalchemy.orm import Session
from backend.config import INTELX_API_KEY
from backend.db.models import Target, Alert
from backend.scoring.severity import AlertData, calculate_severity, get_remediation
from backend.monitors.dedup import is_duplicate, make_alert

logger = logging.getLogger(__name__)

INTELX_BASE = "https://free.intelx.io"
HEADERS = {"x-key": INTELX_API_KEY}


def run(db: Session, targets: list[Target]):
    if not INTELX_API_KEY:
        logger.info("IntelX API key not configured — skipping")
        return
    for target in targets:
        if not target.domain:
            continue
        try:
            _search_domain(db, target)
        except Exception as e:
            logger.error("IntelX error for %s: %s", target.domain, e)


def _search_domain(db: Session, target: Target):
    # Step 1: submit search
    payload = {
        "term": target.domain,
        "buckets": [],
        "lookuplevel": 0,
        "maxresults": 10,
        "timeout": 5,
        "datefrom": "",
        "dateto": "",
        "sort": 2,
        "media": 0,
        "terminate": [],
    }
    resp = requests.post(f"{INTELX_BASE}/intelligent/search", json=payload, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    search_id = resp.json().get("id")
    if not search_id:
        return

    # Step 2: fetch results (wait briefly for indexing)
    time.sleep(3)
    result_resp = requests.get(
        f"{INTELX_BASE}/intelligent/search/result",
        params={"id": search_id, "limit": 10},
        headers=HEADERS,
        timeout=15,
    )
    result_resp.raise_for_status()
    records = result_resp.json().get("records", [])

    if not records:
        return

    alert_data = AlertData(
        source="intelx",
        data={"email_only": True},
        created_at=datetime.utcnow(),
    )
    severity = calculate_severity(alert_data)

    description = f"Domain: {target.domain} — found in {len(records)} IntelligenceX record(s)"

    if is_duplicate(db, target.id, "intelx", description):
        return
    alert = make_alert(
        target_id=target.id,
        source="intelx",
        data_found=description,
        severity=severity,
        raw_data=str([r.get("name", "") for r in records[:3]]),
        remediation_steps=get_remediation(severity),
    )
    db.add(alert)
    db.commit()
    logger.info("IntelX: found %d records for %s", len(records), target.domain)
