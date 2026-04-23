import os
from dotenv import load_dotenv

load_dotenv(override=True)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://admin:password@localhost:5432/breachtower")
HIBP_API_KEY = os.getenv("HIBP_API_KEY", "")  # optional, paid
LEAKCHECK_API_KEY = os.getenv("LEAKCHECK_API_KEY", "")
INTELX_API_KEY = os.getenv("INTELX_API_KEY", "")
LEAKLOOKUP_API_KEY = os.getenv("LEAKLOOKUP_API_KEY", "")
BREACH_DIRECTORY_KEY = os.getenv("BREACH_DIRECTORY_KEY", "")
TELEGRAM_API_ID = int(os.getenv("TELEGRAM_API_ID") or "0")
TELEGRAM_API_HASH = os.getenv("TELEGRAM_API_HASH", "")
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT") or "587")
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
ALERT_EMAIL = os.getenv("ALERT_EMAIL", "")
SLACK_WEBHOOK = os.getenv("SLACK_WEBHOOK", "")
SCAN_INTERVAL_HOURS = int(os.getenv("SCAN_INTERVAL_HOURS") or "6")
PASTEBIN_API_KEY      = os.getenv("PASTEBIN_API_KEY", "")
PASTEBIN_API_USER_KEY = os.getenv("PASTEBIN_API_USER_KEY", "")
