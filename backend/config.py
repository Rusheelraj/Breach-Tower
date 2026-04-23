"""
Config — all values are read live from the environment on every call.

In Docker the .env is loaded via env_file in docker-compose.yml, so
os.getenv() always reflects the current process environment. When keys
are saved via the Settings UI the routes_env handler calls os.environ
directly, so subsequent os.getenv() calls see the new values immediately
without a container restart.

Module-level constants are kept as aliases for backward compatibility
with code that imports them directly, but they are re-evaluated on each
module reload. For live values (e.g. inside request handlers or monitors)
prefer calling get_config() or os.getenv() directly.
"""
import os
from dotenv import load_dotenv

# Load .env into os.environ on startup (override=True so .env wins over
# system env if there's a conflict).  After this, os.getenv() is always
# the source of truth — the module-level names below are convenience aliases.
load_dotenv(override=True)


def get_config() -> dict:
    """Return all config values freshly read from the environment."""
    return {
        "DATABASE_URL":          os.getenv("DATABASE_URL", "postgresql://admin:password@localhost:5432/breachtower"),
        "HIBP_API_KEY":          os.getenv("HIBP_API_KEY", ""),
        "LEAKCHECK_API_KEY":     os.getenv("LEAKCHECK_API_KEY", ""),
        "INTELX_API_KEY":        os.getenv("INTELX_API_KEY", ""),
        "LEAKLOOKUP_API_KEY":    os.getenv("LEAKLOOKUP_API_KEY", ""),
        "BREACH_DIRECTORY_KEY":  os.getenv("BREACH_DIRECTORY_KEY", ""),
        "TELEGRAM_API_ID":       int(os.getenv("TELEGRAM_API_ID") or "0"),
        "TELEGRAM_API_HASH":     os.getenv("TELEGRAM_API_HASH", ""),
        "SMTP_HOST":             os.getenv("SMTP_HOST", "smtp.gmail.com"),
        "SMTP_PORT":             int(os.getenv("SMTP_PORT") or "587"),
        "SMTP_USER":             os.getenv("SMTP_USER", ""),
        "SMTP_PASS":             os.getenv("SMTP_PASS", ""),
        "ALERT_EMAIL":           os.getenv("ALERT_EMAIL", ""),
        "SLACK_WEBHOOK":         os.getenv("SLACK_WEBHOOK", ""),
        "SCAN_INTERVAL_HOURS":   int(os.getenv("SCAN_INTERVAL_HOURS") or "6"),
        "PASTEBIN_API_KEY":      os.getenv("PASTEBIN_API_KEY", ""),
        "PASTEBIN_API_USER_KEY": os.getenv("PASTEBIN_API_USER_KEY", ""),
    }


# Convenience aliases — these reflect the value at import time.
# For monitors and request handlers that need live values, use os.getenv()
# or get_config() instead.
DATABASE_URL          = os.getenv("DATABASE_URL", "postgresql://admin:password@localhost:5432/breachtower")
HIBP_API_KEY          = os.getenv("HIBP_API_KEY", "")
LEAKCHECK_API_KEY     = os.getenv("LEAKCHECK_API_KEY", "")
INTELX_API_KEY        = os.getenv("INTELX_API_KEY", "")
LEAKLOOKUP_API_KEY    = os.getenv("LEAKLOOKUP_API_KEY", "")
BREACH_DIRECTORY_KEY  = os.getenv("BREACH_DIRECTORY_KEY", "")
TELEGRAM_API_ID       = int(os.getenv("TELEGRAM_API_ID") or "0")
TELEGRAM_API_HASH     = os.getenv("TELEGRAM_API_HASH", "")
SMTP_HOST             = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT             = int(os.getenv("SMTP_PORT") or "587")
SMTP_USER             = os.getenv("SMTP_USER", "")
SMTP_PASS             = os.getenv("SMTP_PASS", "")
ALERT_EMAIL           = os.getenv("ALERT_EMAIL", "")
SLACK_WEBHOOK         = os.getenv("SLACK_WEBHOOK", "")
SCAN_INTERVAL_HOURS   = int(os.getenv("SCAN_INTERVAL_HOURS") or "6")
PASTEBIN_API_KEY      = os.getenv("PASTEBIN_API_KEY", "")
PASTEBIN_API_USER_KEY = os.getenv("PASTEBIN_API_USER_KEY", "")
