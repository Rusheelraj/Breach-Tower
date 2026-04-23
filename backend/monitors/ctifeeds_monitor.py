"""
CTI Feeds — https://ctifeeds.andreafortuna.org
Free, no-auth, static JSON feeds updated regularly.

Feeds:
  dataleaks        — recent data breaches and leaks
  phishing_sites   — latest phishing websites and campaigns
  datamarkets      — underground data markets and forums
  ransomware_victims — latest ransomware attack victims
  recent_defacements — recently defaced websites

Each JSON record has: url, name, source, screenshot, status, timestamp, urlscan, id
"""
import logging
import requests
from datetime import datetime
from sqlalchemy.orm import Session
from backend.db.models import Target
from backend.scoring.severity import AlertData, calculate_severity, get_remediation
from backend.monitors.dedup import is_duplicate, make_alert

logger = logging.getLogger(__name__)

BASE = "https://ctifeeds.andreafortuna.org"

FEEDS = [
    ("dataleaks",             "HIGH",     "Data leak/breach"),
    ("phishing_sites",        "MEDIUM",   "Phishing site"),
    ("datamarkets",           "HIGH",     "Underground data market"),
    ("ransomware_victims",    "CRITICAL", "Ransomware victim"),
    ("recent_defacements",    "MEDIUM",   "Website defacement"),
]

HEADERS = {"User-Agent": "BreachTower/1.0", "Accept": "application/json"}


def _fetch_feed(slug: str) -> list[dict]:
    try:
        resp = requests.get(f"{BASE}/{slug}.json", headers=HEADERS, timeout=20)
        if not resp.ok:
            logger.warning("CTIFeeds: failed to fetch %s (%s)", slug, resp.status_code)
            return []
        return resp.json()
    except Exception as e:
        logger.warning("CTIFeeds: error fetching %s — %s", slug, e)
        return []


def _matches_target(record: dict, domain: str, email_pattern: str | None) -> bool:
    """Return True if the record is relevant to the given target."""
    name = (record.get("name") or "").lower()
    url  = (record.get("url")  or "").lower()
    text = name + " " + url

    # Domain match
    if domain and domain.lower() in text:
        return True

    # Email pattern — extract just the domain part for matching
    if email_pattern and "@" in email_pattern:
        ep_domain = email_pattern.split("@", 1)[1].lower()
        if ep_domain and ep_domain in text:
            return True

    return False


def run(db: Session, targets: list[Target]):
    total_alerts = 0

    for slug, default_severity, category in FEEDS:
        records = _fetch_feed(slug)
        if not records:
            continue

        logger.info("CTIFeeds: %d records in %s feed", len(records), slug)

        for target in targets:
            domain        = (target.domain or "").lower()
            email_pattern = target.email_pattern

            matched = [r for r in records if _matches_target(r, domain, email_pattern)]
            if not matched:
                continue

            for record in matched:
                name      = record.get("name", "unknown")
                url       = record.get("url", "")
                source    = record.get("source", "unknown")
                timestamp = record.get("timestamp", "")

                data_found = (
                    f"[{category}] {name} — source: {source}"
                    + (f" — {url}" if url else "")
                    + (f" — reported: {timestamp[:10]}" if timestamp else "")
                )

                if is_duplicate(db, target.id, "ctifeeds", data_found):
                    continue

                # Map feed severity to AlertData format
                severity_map = {
                    "CRITICAL": {"plaintext_password": True},
                    "HIGH":     {"password_hash": True},
                    "MEDIUM":   {"email_only": True},
                    "LOW":      {"domain_mention": True},
                }
                alert_data = AlertData(
                    source="ctifeeds",
                    data=severity_map.get(default_severity, {"email_only": True}),
                    created_at=datetime.utcnow(),
                )
                severity = calculate_severity(alert_data)

                alert = make_alert(
                    target_id=target.id,
                    source="ctifeeds",
                    data_found=data_found,
                    severity=severity,
                    raw_data=url or name,
                    remediation_steps=get_remediation(severity),
                )
                db.add(alert)
                total_alerts += 1
                logger.info("CTIFeeds: alert — %s", data_found[:120])

        db.commit()

    if total_alerts:
        logger.info("CTIFeeds: %d total alert(s) generated", total_alerts)
    else:
        logger.info("CTIFeeds: no matches found across all feeds")
