import logging
import requests
from datetime import datetime
from sqlalchemy.orm import Session
from backend.config import BREACH_DIRECTORY_KEY
from backend.db.models import Target, Alert
from backend.scoring.severity import AlertData, calculate_severity, get_remediation
from backend.monitors.dedup import is_duplicate, make_alert

logger = logging.getLogger(__name__)

BD_BASE = "https://breachdirectory.p.rapidapi.com"

def _get_headers():
    return {
        "x-rapidapi-key": BREACH_DIRECTORY_KEY,
        "x-rapidapi-host": "breachdirectory.p.rapidapi.com",
        "Content-Type": "application/json",
    }

STRONG_HASH_PREFIXES = ("$2b$", "$2a$", "$argon2", "$scrypt")


def run(db: Session, targets: list[Target]):
    emails = _collect_emails(targets)
    for target, email in emails:
        try:
            _check_email(db, target, email)
        except Exception as e:
            logger.error("BreachDirectory error for %s: %s", email, e)


def _collect_emails(targets: list[Target]) -> list[tuple]:
    result = []
    for t in targets:
        if t.email_pattern:
            result.append((t, t.email_pattern))
        elif t.domain:
            result.append((t, f"*@{t.domain}"))
    return result


def _check_email(db: Session, target: Target, email: str):
    resp = requests.get(
        f"{BD_BASE}/",
        headers=_get_headers(),
        params={"func": "auto", "term": email},
        timeout=15,
    )

    if resp.status_code == 404:
        return
    resp.raise_for_status()

    data = resp.json()
    if not data.get("found"):
        return

    for result in data.get("result", []):
        hashed = result.get("has_password", False)
        password_value = result.get("password", "")
        sha1 = result.get("sha1", "")

        is_strong_hash = any(password_value.startswith(p) for p in STRONG_HASH_PREFIXES)

        alert_data_dict = {}
        if not hashed or not password_value:
            alert_data_dict["email_only"] = True
        elif is_strong_hash:
            alert_data_dict["password_hash"] = True
        else:
            alert_data_dict["plaintext_password"] = True

        alert_data = AlertData(
            source="breach",
            data=alert_data_dict,
            created_at=datetime.utcnow(),
        )
        severity = calculate_severity(alert_data)
        display_email = email.replace("*@", "found@")

        description = f"Email: {display_email}"
        if alert_data_dict.get("plaintext_password"):
            description += f" — plaintext or weak hash exposed: {password_value}"
        elif alert_data_dict.get("password_hash"):
            description += f" — strong password hash: {password_value}"
        else:
            description += " — email address found in breach"

        if is_duplicate(db, target.id, "breach", description):
            continue
        alert = make_alert(
            target_id=target.id,
            source="breach",
            data_found=description,
            severity=severity,
            raw_data=sha1 or password_value or "",
            remediation_steps=get_remediation(severity),
        )
        db.add(alert)

    db.commit()
    logger.info("BreachDirectory: processed results for %s", email)
