import json
import logging
import requests
from backend.db.models import Alert, Settings

logger = logging.getLogger(__name__)

SEVERITY_EMOJI = {
    "CRITICAL": ":rotating_light:",
    "HIGH": ":warning:",
    "MEDIUM": ":large_yellow_circle:",
    "LOW": ":information_source:",
}

SEVERITY_COLOR = {
    "CRITICAL": "#dc2626",
    "HIGH": "#ea580c",
    "MEDIUM": "#ca8a04",
    "LOW": "#2563eb",
}


def send_slack_alert(alert: Alert, settings: Settings):
    if not settings.slack_webhook:
        return

    emoji = SEVERITY_EMOJI.get(alert.severity, ":bell:")
    color = SEVERITY_COLOR.get(alert.severity, "#6b7280")

    payload = {
        "attachments": [
            {
                "color": color,
                "blocks": [
                    {
                        "type": "header",
                        "text": {
                            "type": "plain_text",
                            "text": f"{emoji} Breach Tower Alert — {alert.severity}",
                        },
                    },
                    {
                        "type": "section",
                        "fields": [
                            {"type": "mrkdwn", "text": f"*Source:*\n{alert.source.upper()}"},
                            {"type": "mrkdwn", "text": f"*Severity:*\n{alert.severity}"},
                        ],
                    },
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f"*Data Found:*\n{alert.data_found}",
                        },
                    },
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f"*Action Required:*\n{alert.remediation_steps}",
                        },
                    },
                    {
                        "type": "actions",
                        "elements": [
                            {
                                "type": "button",
                                "text": {"type": "plain_text", "text": "View Dashboard"},
                                "url": "http://localhost:3000",
                                "style": "danger" if alert.severity == "CRITICAL" else "primary",
                            }
                        ],
                    },
                ],
            }
        ]
    }

    _post_webhook(settings.slack_webhook, payload)


def send_generic_webhook(alert: Alert, settings: Settings):
    """Generic webhook for Teams, Discord, or custom integrations."""
    if not settings.slack_webhook:
        return

    payload = {
        "severity": alert.severity,
        "source": alert.source,
        "data_found": alert.data_found,
        "remediation_steps": alert.remediation_steps,
        "created_at": alert.created_at.isoformat(),
        "alert_id": alert.id,
    }
    _post_webhook(settings.slack_webhook, payload)


def _post_webhook(url: str, payload: dict):
    try:
        resp = requests.post(
            url,
            data=json.dumps(payload),
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
        resp.raise_for_status()
        logger.info("Webhook alert delivered to %s", url[:40])
    except Exception as e:
        logger.error("Webhook delivery failed: %s", e)
