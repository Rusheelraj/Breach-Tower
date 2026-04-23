"""
Paste monitor — searches for exposed credentials on paste sites.

Sources used (in order):
1. Pastebin Scraping API  — requires IP whitelisting at pastebin.com/doc_scraping_api
2. Google Custom Search   — fallback, searches pastebin.com results for the domain
3. Direct paste fetch     — fetches raw content of any paste keys found
"""
import re
import logging
import requests
from datetime import datetime
from sqlalchemy.orm import Session
from backend.db.models import Target
from backend.scoring.severity import AlertData, calculate_severity, get_remediation
from backend.monitors.dedup import is_duplicate, make_alert
import os

logger = logging.getLogger(__name__)

PASTEBIN_SCRAPING_URL = "https://scrape.pastebin.com/api_scraping.php"
PASTEBIN_PUBLIC_RAW   = "https://pastebin.com/raw/"
BREACHDIR_SEARCH_URL  = "https://breachdirectory.p.rapidapi.com/"

HEADERS = {"User-Agent": "BreachTower/1.0"}
SCRAPE_LIMIT = 250


def _scrape_recent_pastes() -> list[dict]:
    """Fetch recent public pastes via Pastebin scraping API (requires IP whitelist)."""
    try:
        resp = requests.get(
            PASTEBIN_SCRAPING_URL,
            params={"limit": SCRAPE_LIMIT},
            timeout=20,
            headers=HEADERS,
        )
        if not resp.ok:
            logger.warning("Pastebin scraping API error: %s %s", resp.status_code, resp.text[:200])
            return []
        return resp.json()
    except Exception as e:
        logger.warning("Pastebin scraping fetch error: %s", e)
        return []


def _fetch_paste_raw(paste_key: str) -> str:
    """Fetch raw content of a public paste."""
    try:
        resp = requests.get(
            f"{PASTEBIN_PUBLIC_RAW}{paste_key}",
            timeout=15,
            headers=HEADERS,
        )
        return resp.text if resp.ok else ""
    except Exception as e:
        logger.debug("Paste fetch error for %s: %s", paste_key, e)
        return ""


def _search_google_for_pastes(domain: str) -> list[str]:
    """
    Use Google's indexed results to find Pastebin pastes containing the domain.
    Extracts paste keys from search result URLs.
    Falls back silently if unavailable.
    """
    try:
        # Use DuckDuckGo HTML search (no API key needed)
        query = f'site:pastebin.com "{domain}"'
        resp = requests.get(
            "https://html.duckduckgo.com/html/",
            params={"q": query},
            headers={**HEADERS, "Accept": "text/html"},
            timeout=15,
        )
        if not resp.ok:
            return []
        # Extract pastebin.com/XXXXX keys from HTML
        keys = re.findall(r'pastebin\.com/([A-Za-z0-9]{8})\b', resp.text)
        # Deduplicate, exclude raw/ and api/ paths
        seen = set()
        result = []
        for k in keys:
            if k not in seen and k not in ("raw", "api", "doc", "archive"):
                seen.add(k)
                result.append(k)
        return result[:10]  # limit to 10 per domain
    except Exception as e:
        logger.debug("DuckDuckGo search error: %s", e)
        return []


def _process_content(db, paste_key, content, domain, target, found_count):
    """Check paste content for domain matches and create alerts."""
    pattern = re.compile(
        r"[\w.\-+]+@" + re.escape(domain),
        re.IGNORECASE,
    )
    email_matches = pattern.findall(content)

    # Also flag if domain appears in credential dump context
    dump_pattern = re.compile(
        r"[\w.\-+]+[:|][\w.\-+]+@" + re.escape(domain) + r"|"
        r"@" + re.escape(domain) + r"[:|]",
        re.IGNORECASE,
    )
    dump_matches = dump_pattern.findall(content)

    all_matches = email_matches or dump_matches
    if not all_matches and domain.lower() not in content.lower():
        return found_count

    if email_matches:
        data_found = (
            f"Pastebin {paste_key}: {len(email_matches)} email(s) found for {domain} "
            f"— {', '.join(email_matches[:5])}"
        )
        data_type = {"email_only": True}
    else:
        data_found = f"Pastebin {paste_key}: domain {domain} referenced in paste (possible credential dump)"
        data_type = {"domain_mention": True}

    if is_duplicate(db, target.id, "paste", data_found):
        return found_count

    alert_data = AlertData(
        source="paste",
        data=data_type,
        created_at=datetime.utcnow(),
    )
    severity = calculate_severity(alert_data)
    alert = make_alert(
        target_id=target.id,
        source="paste",
        data_found=data_found,
        severity=severity,
        raw_data=f"pastebin.com/{paste_key}",
        remediation_steps=get_remediation(severity),
    )
    db.add(alert)
    logger.info("Paste monitor: alert — %s", data_found[:100])
    return found_count + 1


def run(db: Session, targets: list[Target]):
    domain_targets = {t.domain.lower(): t for t in targets if t.domain}
    if not domain_targets:
        return

    found = 0

    # ── Strategy 1: Pastebin scraping API (requires IP whitelist) ────────────
    pastes = _scrape_recent_pastes()

    if pastes:
        logger.info("Paste monitor: scanning %d recent pastes via scraping API", len(pastes))
        for paste in pastes:
            paste_key = paste.get("key", "")
            if not paste_key:
                continue
            content = _fetch_paste_raw(paste_key)
            if not content:
                continue
            for domain, target in domain_targets.items():
                found = _process_content(db, paste_key, content, domain, target, found)
        db.commit()
        logger.info("Paste monitor: scraping API scan complete — %d alert(s)", found)
        return

    # ── Strategy 2: DuckDuckGo search fallback ───────────────────────────────
    logger.info("Paste monitor: scraping API unavailable (IP not whitelisted) — trying search fallback")
    for domain, target in domain_targets.items():
        paste_keys = _search_google_for_pastes(domain)
        if not paste_keys:
            logger.info("Paste monitor: no paste results found for %s via search", domain)
            continue
        logger.info("Paste monitor: found %d paste key(s) for %s via search", len(paste_keys), domain)
        for key in paste_keys:
            content = _fetch_paste_raw(key)
            if not content:
                continue
            found = _process_content(db, key, content, domain, target, found)

    db.commit()
    logger.info("Paste monitor: search fallback complete — %d alert(s)", found)
