"""
LeakCheck.io — https://leakcheck.io
Free public API: 50 queries/day via /api/public endpoint (no auth, max 3 sources).

Response format:
{
    "success": true,
    "found": 3,
    "fields": ["username", "email", "password"],
    "sources": [
        {"name": "Example.com", "date": "2022-01"},
        ...
    ]
}
"""
import logging
import requests
from datetime import datetime
from sqlalchemy.orm import Session
from backend.db.models import Target, Alert
from backend.scoring.severity import AlertData, calculate_severity, get_remediation
from backend.monitors.dedup import is_duplicate, make_alert

logger = logging.getLogger(__name__)

# Free public endpoint — no key required, 50 req/day, max 3 sources shown
LEAKCHECK_FREE = "https://leakcheck.io/api/public?check={query}"


def run(db: Session, targets: list[Target]):
    for target in targets:
        try:
            if (
                target.email_pattern
                and "@" in target.email_pattern
                and not target.email_pattern.startswith("*")
            ):
                # Direct email query — most accurate
                logger.info("LeakCheck: querying email %s", target.email_pattern)
                _query(db, target, target.email_pattern)
            elif target.domain:
                # Domain-only target — query the domain directly
                logger.info("LeakCheck: querying domain %s", target.domain)
                _query(db, target, target.domain)
            else:
                logger.info("LeakCheck: skipping target %s — no email or domain", target.id)
        except Exception as e:
            logger.error("LeakCheck error for target %s: %s", target.id, e)


def _query(db: Session, target: Target, term: str):
    quoted = requests.utils.quote(term, safe="")
    url = LEAKCHECK_FREE.format(query=quoted)
    headers = {"Accept": "application/json"}

    resp = requests.get(url, headers=headers, timeout=15)

    if resp.status_code == 404:
        return
    if resp.status_code == 429:
        logger.warning("LeakCheck: rate limit reached (50/day exceeded)")
        return
    if not resp.ok:
        logger.error("LeakCheck: request failed (%s) — %s", resp.status_code, resp.text[:200])
        return

    data = resp.json()

    if not data.get("success"):
        logger.debug("LeakCheck: not found for %s", term)
        return

    found_count = data.get("found", 0)
    if not found_count:
        return

    sources = data.get("sources", [])
    fields  = [f.lower() for f in data.get("fields", [])]

    # Determine severity based on exposed fields
    has_plain = "password" in fields
    has_hash  = any(f in fields for f in ("hash", "password_hash"))

    alert_data_dict = {}
    if has_plain:
        alert_data_dict["plaintext_password"] = True
    elif has_hash:
        alert_data_dict["password_hash"] = True
    else:
        alert_data_dict["email_only"] = True

    alert_data = AlertData(
        source="leakcheck",
        data=alert_data_dict,
        created_at=datetime.utcnow(),
    )
    severity = calculate_severity(alert_data)

    source_names = [s.get("name", "unknown") for s in sources][:6]

    description = (
        f"Query: {term} — found in {found_count} breach(es) across: {', '.join(source_names) or 'unknown'}"
    )
    if has_plain:
        description += " — plaintext password exposed"
    elif has_hash:
        description += " — password hash found"
    if fields:
        description += f" — exposed fields: {', '.join(fields[:6])}"

    if is_duplicate(db, target.id, "leakcheck", description):
        return

    alert = make_alert(
        target_id=target.id,
        source="leakcheck",
        data_found=description,
        severity=severity,
        raw_data=str(source_names),
        remediation_steps=get_remediation(severity),
    )
    db.add(alert)
    db.commit()
    logger.info("LeakCheck: %d breach(es) found for %s — fields: %s", found_count, term, fields)
