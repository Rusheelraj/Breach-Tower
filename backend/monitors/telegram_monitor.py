"""
Telegram stealer log monitor — connects only to PUBLIC channels.
Requires TELEGRAM_API_ID and TELEGRAM_API_HASH from my.telegram.org.

LEGAL NOTE: Only monitor public Telegram channels. Never join or scrape
private/invite-only channels. Use solely for defensive monitoring of
domains/emails you own or have written authorization to monitor.
"""
import re
import logging
import asyncio
from datetime import datetime
from sqlalchemy.orm import Session
from backend.config import TELEGRAM_API_ID, TELEGRAM_API_HASH
from backend.db.models import Target, Alert, TelegramChannel
from backend.scoring.severity import AlertData, calculate_severity, get_remediation
from backend.monitors.dedup import is_duplicate, make_alert

logger = logging.getLogger(__name__)

# Public channels to monitor — only public @username channels
PUBLIC_CHANNELS = [
    "@DaisyLogsUpdate",
    "@moon_cloudspublic",
]

# Format 1: URL | email@domain | password
STEALER_PIPE_PATTERN = re.compile(
    r"(https?://[^\s|]+)\s*\|\s*([\w.\-+]+@[\w.\-]+\.[a-zA-Z]{2,})\s*\|\s*([^\s\n|]+)",
    re.IGNORECASE,
)
# Format 2: bare email anywhere in message text
EMAIL_PATTERN = re.compile(r"[\w.\-+]+@[\w.\-]+\.[a-zA-Z]{2,}", re.IGNORECASE)


def run(db: Session, targets: list[Target]):
    if not TELEGRAM_API_ID or not TELEGRAM_API_HASH:
        logger.warning("Telegram API credentials not configured — skipping")
        return
    # Merge hardcoded defaults with DB-managed channels
    db_channels = [
        c.username for c in
        db.query(TelegramChannel).filter(TelegramChannel.enabled == True).all()  # noqa: E712
    ]
    channels = list(dict.fromkeys(db_channels + PUBLIC_CHANNELS))  # DB first, dedup
    if not channels:
        logger.info("No Telegram channels configured — skipping")
        return
    try:
        asyncio.run(_async_run(db, targets, channels))
    except Exception as e:
        logger.error("Telegram monitor error: %s", e)


async def _async_run(db: Session, targets: list[Target], channels: list[str] = None):
    try:
        from telethon import TelegramClient
        from telethon.errors import ChannelPrivateError
    except ImportError:
        logger.error("telethon not installed — run: pip install telethon")
        return

    domain_set = {t.domain.lower() for t in targets if t.domain}
    target_map = {t.domain.lower(): t for t in targets if t.domain}

    if not domain_set:
        logger.info("Telegram: no domain targets configured")
        return

    active_channels = channels or PUBLIC_CHANNELS
    async with TelegramClient("breachtower_session", TELEGRAM_API_ID, TELEGRAM_API_HASH) as client:
        for channel in active_channels:
            logger.info("Telegram: scanning channel %s", channel)
            try:
                async for message in client.iter_messages(channel, limit=500):
                    if not message.text:
                        continue
                    _process_message(db, message.text, domain_set, target_map)
            except ChannelPrivateError:
                logger.warning("Skipping private/inaccessible channel: %s", channel)
            except Exception as e:
                logger.error("Error reading channel %s: %s", channel, e)

    db.commit()


def _process_message(db: Session, text: str, domain_set: set, target_map: dict):
    seen = {}  # deduplicate by (target_id, credential)

    # Format 1: URL | email | password — highest confidence, marks as plaintext
    for match in STEALER_PIPE_PATTERN.finditer(text):
        url, credential, password = match.groups()
        _register_match(seen, domain_set, target_map, credential,
                        data_type={"plaintext_password": True},
                        description=f"Stealer log — {credential} | site: {url} | password exposed",
                        raw=f"url={url}|user={credential}|pass={password[:4]}***")

    # Format 2: bare email in message text
    for m in EMAIL_PATTERN.finditer(text):
        credential = m.group(0)
        _register_match(seen, domain_set, target_map, credential,
                        data_type={"email_only": True},
                        description=f"Email found in Telegram channel — {credential}",
                        raw=credential)

    for (target_id, _), info in seen.items():
        alert_data = AlertData(
            source="telegram",
            data=info["data_type"],
            created_at=datetime.utcnow(),
        )
        severity = calculate_severity(alert_data)
        if is_duplicate(db, target_id, "telegram", info["description"]):
            continue
        alert = make_alert(
            target_id=target_id,
            source="telegram",
            data_found=info["description"],
            severity=severity,
            raw_data=info["raw"],
            remediation_steps=get_remediation(severity),
        )
        db.add(alert)
        logger.info("Telegram: alert created — %s", info["description"][:100])


def _register_match(seen, domain_set, target_map, credential, data_type, description, raw):
    email_lower = credential.lower()
    matched_domain = next((d for d in domain_set if email_lower.endswith(f"@{d}")), None)
    if not matched_domain:
        return
    target = target_map[matched_domain]
    key = (target.id, email_lower)
    # Prefer plaintext_password entry over email_only if both match
    if key not in seen or data_type.get("plaintext_password"):
        seen[key] = {"data_type": data_type, "description": description, "raw": raw}
