import logging
import requests
from datetime import datetime
from sqlalchemy.orm import Session
from backend.config import HIBP_API_KEY
from backend.db.models import Target, Alert
from backend.scoring.severity import AlertData, calculate_severity, get_remediation

logger = logging.getLogger(__name__)

HIBP_BASE = "https://haveibeenpwned.com/api/v3"
HEADERS = {
    "hibp-api-key": HIBP_API_KEY,
    "User-Agent": "BreachTower/1.0",
}


def run(db: Session, targets: list[Target]):
    for target in targets:
        if not target.domain:
            continue
        try:
            _check_domain(db, target)
        except Exception as e:
            logger.error("HIBP monitor error for %s: %s", target.domain, e)


def _check_domain(db: Session, target: Target):
    url = f"{HIBP_BASE}/breacheddomain/{target.domain}"
    resp = requests.get(url, headers=HEADERS, timeout=15)

    if resp.status_code == 404:
        return
    if resp.status_code == 401:
        logger.error("HIBP: invalid API key")
        return
    resp.raise_for_status()

    breached_accounts: dict = resp.json()
    for email_alias, breach_names in breached_accounts.items():
        full_email = f"{email_alias}@{target.domain}"
        alert_data = AlertData(
            source="hibp",
            data={"email_only": True},
            created_at=datetime.utcnow(),
        )
        severity = calculate_severity(alert_data)

        alert = Alert(
            target_id=target.id,
            source="hibp",
            data_found=f"Email: {full_email} — found in breaches: {', '.join(breach_names)}",
            severity=severity,
            raw_data=str(breach_names),
            remediation_steps=get_remediation(severity),
        )
        db.add(alert)

    db.commit()
    logger.info("HIBP: processed %d breached accounts for %s", len(breached_accounts), target.domain)
