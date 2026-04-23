"""
LeakCheck.io — https://leakcheck.io
Authenticated API: uses LEAKCHECK_API_KEY for full results.
Falls back to free public endpoint (50 req/day, max 3 sources) if no key set.

Authenticated response format:
{
    "success": true,
    "found": 3,
    "result": [
        {
            "email": "user@domain.com",
            "fields": ["email", "password", "username"],
            "password": "plaintextpass",
            "sources": [{"name": "Example.com", "breach_date": "2022-01"}]
        }
    ]
}

Public response format:
{
    "success": true,
    "found": 3,
    "fields": ["username", "email", "password"],
    "sources": [{"name": "Example.com", "date": "2022-01"}]
}
"""
import logging
import requests
from datetime import datetime
from sqlalchemy.orm import Session
from backend.config import LEAKCHECK_API_KEY
from backend.db.models import Target
from backend.scoring.severity import AlertData, calculate_severity, get_remediation
from backend.monitors.dedup import is_duplicate, make_alert

logger = logging.getLogger(__name__)

LEAKCHECK_AUTH_URL  = "https://leakcheck.io/api/v2/query/{query}"
LEAKCHECK_FREE_URL  = "https://leakcheck.io/api/public?check={query}"


def run(db: Session, targets: list[Target]):
    for target in targets:
        try:
            if (
                target.email_pattern
                and "@" in target.email_pattern
                and not target.email_pattern.startswith("*")
            ):
                logger.info("LeakCheck: querying email %s", target.email_pattern)
                _query(db, target, target.email_pattern)
            elif target.domain:
                logger.info("LeakCheck: querying domain %s", target.domain)
                _query(db, target, target.domain)
            else:
                logger.info("LeakCheck: skipping target %s — no email or domain", target.id)
        except Exception as e:
            logger.error("LeakCheck error for target %s: %s", target.id, e)


def _query(db: Session, target: Target, term: str):
    if LEAKCHECK_API_KEY:
        # Try authenticated first — fall back to public if key is invalid
        try:
            result = _query_authenticated(db, target, term)
            if result is not False:
                return
        except Exception as e:
            logger.error("LeakCheck auth error: %s — falling back to public endpoint", e)
    _query_public(db, target, term)


def _query_authenticated(db: Session, target: Target, term: str):
    """Use authenticated API — returns full result list with passwords."""
    quoted = requests.utils.quote(term, safe="")
    url = LEAKCHECK_AUTH_URL.format(query=quoted)
    headers = {
        "X-API-Key": LEAKCHECK_API_KEY,
        "Accept": "application/json",
    }

    resp = requests.get(url, headers=headers, timeout=15)

    if resp.status_code == 404:
        logger.debug("LeakCheck: no results for %s", term)
        return
    if resp.status_code == 401:
        logger.error("LeakCheck: invalid API key — check LEAKCHECK_API_KEY in .env")
        return
    if resp.status_code == 429:
        logger.warning("LeakCheck: rate limit reached")
        return
    if not resp.ok:
        logger.error("LeakCheck: request failed (%s) — %s", resp.status_code, resp.text[:200])
        return

    data = resp.json()
    if not data.get("success"):
        logger.debug("LeakCheck: no results for %s — %s", term, data.get("message", ""))
        return

    found_count = data.get("found", 0)
    if not found_count:
        return

    results = data.get("result", [])
    logger.info("LeakCheck (auth): %d result(s) for %s", found_count, term)

    for entry in results:
        fields = [f.lower() for f in entry.get("fields", [])]
        password = entry.get("password", "")
        email = entry.get("email", term)
        sources = entry.get("sources", [])
        source_names = [s.get("name", "unknown") for s in sources][:6]

        has_plain = bool(password) and "password" in fields
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

        description = (
            f"Query: {email} — found in breach(es): {', '.join(source_names) or 'unknown'}"
        )
        if has_plain:
            description += f" — plaintext password exposed: {password[:4]}***"
        elif has_hash:
            description += " — password hash found"
        if fields:
            description += f" — exposed fields: {', '.join(fields[:6])}"

        if is_duplicate(db, target.id, "leakcheck", description):
            continue

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
    logger.info("LeakCheck (auth): processed %d result(s) for %s", len(results), term)


def _query_public(db: Session, target: Target, term: str):
    """Fallback: free public endpoint — 50 req/day, max 3 sources, no passwords."""
    quoted = requests.utils.quote(term, safe="")
    url = LEAKCHECK_FREE_URL.format(query=quoted)
    headers = {"Accept": "application/json"}

    resp = requests.get(url, headers=headers, timeout=15)

    if resp.status_code == 404:
        return
    if resp.status_code == 429:
        logger.warning("LeakCheck: free tier rate limit reached (50/day)")
        return
    if not resp.ok:
        logger.error("LeakCheck: request failed (%s) — %s", resp.status_code, resp.text[:200])
        return

    data = resp.json()
    if not data.get("success"):
        return

    found_count = data.get("found", 0)
    if not found_count:
        return

    sources = data.get("sources", [])
    fields  = [f.lower() for f in data.get("fields", [])]
    source_names = [s.get("name", "unknown") for s in sources][:6]

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

    description = (
        f"Query: {term} — found in {found_count} breach(es): {', '.join(source_names) or 'unknown'}"
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
    logger.info("LeakCheck (public): %d breach(es) for %s — fields: %s", found_count, term, fields)
