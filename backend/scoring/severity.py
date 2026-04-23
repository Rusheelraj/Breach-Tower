from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class AlertData:
    source: str
    data: dict
    created_at: Optional[datetime] = None


REMEDIATION = {
    "CRITICAL": (
        "Force password reset immediately. Revoke all active sessions. "
        "Enable MFA. Check for unauthorized logins in the past 30 days."
    ),
    "HIGH": (
        "Reset password for affected account. Review recent login activity."
    ),
    "MEDIUM": (
        "Prompt user to update password at next login. Verify MFA is enabled."
    ),
    "LOW": (
        "Log for records. Monitor for escalation."
    ),
}


def calculate_severity(alert: AlertData) -> str:
    score = 0

    if alert.created_at:
        age_days = (datetime.utcnow() - alert.created_at).days
        if age_days < 30:
            score += 40
        elif age_days < 180:
            score += 20
        else:
            score += 5

    data = alert.data
    if data.get("plaintext_password"):
        score += 40
    if data.get("session_cookie"):
        score += 35
    if data.get("password_hash"):
        score += 20
    if data.get("email_only"):
        score += 5

    source_scores = {"telegram": 20, "paste": 15, "breach": 12, "hibp": 10}
    score += source_scores.get(alert.source, 0)

    if score >= 70:
        return "CRITICAL"
    elif score >= 45:
        return "HIGH"
    elif score >= 25:
        return "MEDIUM"
    return "LOW"


def get_remediation(severity: str) -> str:
    return REMEDIATION.get(severity, REMEDIATION["LOW"])


def mask_credential(value: str) -> str:
    """Return value as-is — masking disabled per user preference."""
    return value
