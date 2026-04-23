"""
Leak-Lookup API — https://leak-lookup.com/api/search
Free public key: 10 requests/day.
Supports: email_address, domain, username, ipaddress, phone, password, fullname
"""
import logging
import requests
from datetime import datetime
from sqlalchemy.orm import Session
from backend.config import LEAKLOOKUP_API_KEY
from backend.db.models import Target, Alert
from backend.scoring.severity import AlertData, calculate_severity, get_remediation
from backend.monitors.dedup import is_duplicate, make_alert

logger = logging.getLogger(__name__)

LEAKLOOKUP_URL = "https://leak-lookup.com/api/search"


def run(db: Session, targets: list[Target]):
    if not LEAKLOOKUP_API_KEY:
        logger.warning("Leak-Lookup API key not configured — skipping")
        return
    for target in targets:
        try:
            if target.domain:
                _search(db, target, "domain", target.domain)
            if target.email_pattern and "@" in target.email_pattern and not target.email_pattern.startswith("*"):
                _search(db, target, "email_address", target.email_pattern)
        except Exception as e:
            logger.error("Leak-Lookup error for target %s: %s", target.domain or target.email_pattern, e)


def _search(db: Session, target: Target, search_type: str, query: str):
    resp = requests.post(
        LEAKLOOKUP_URL,
        data={"key": LEAKLOOKUP_API_KEY, "type": search_type, "query": query},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    if str(data.get("error")).lower() != "false":
        msg = data.get("message", "unknown error")
        if "REQUEST LIMIT" in str(msg).upper():
            logger.warning("Leak-Lookup: daily request limit reached")
        elif "BLACKLISTED" in str(msg).upper():
            logger.warning("Leak-Lookup: query blacklisted for %s", query)
        else:
            logger.error("Leak-Lookup API error: %s", msg)
        return

    breaches: dict = data.get("message", {})
    if not breaches:
        return

    breach_names = list(breaches.keys())
    # Public key returns no field data — count breach names only
    alert_data = AlertData(
        source="leaklookup",
        data={"email_only": True},
        created_at=datetime.utcnow(),
    )
    severity = calculate_severity(alert_data)

    description = (
        f"{search_type.replace('_', ' ').title()}: {query} — "
        f"found in {len(breach_names)} breach(es): {', '.join(breach_names[:8])}"
        + (" and more…" if len(breach_names) > 8 else "")
    )

    if is_duplicate(db, target.id, "leaklookup", description):
        return
    alert = make_alert(
        target_id=target.id,
        source="leaklookup",
        data_found=description,
        severity=severity,
        raw_data=str(breach_names),
        remediation_steps=get_remediation(severity),
    )
    db.add(alert)
    db.commit()
    logger.info("Leak-Lookup: %s '%s' found in %d breach(es)", search_type, query, len(breach_names))
