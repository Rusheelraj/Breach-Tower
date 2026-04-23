"""
SIEM webhook output — pushes alerts in JSON or CEF format to
Splunk HEC, Elastic, or any generic webhook endpoint.
"""
import json
import logging
import urllib.request
import urllib.error
from datetime import datetime

logger = logging.getLogger(__name__)

SEVERITY_CEF = {"CRITICAL": "10", "HIGH": "8", "MEDIUM": "5", "LOW": "2"}


def _to_json(alert, target) -> dict:
    return {
        "timestamp":   alert.created_at.isoformat() + "Z",
        "id":          alert.id,
        "source":      alert.source,
        "severity":    alert.severity,
        "target":      target.domain or target.email_pattern or str(alert.target_id),
        "data_found":  alert.data_found,
        "acknowledged": alert.acknowledged,
    }


def _to_cef(alert, target) -> str:
    sev = SEVERITY_CEF.get(alert.severity, "5")
    tgt = target.domain or target.email_pattern or str(alert.target_id)
    ext = (
        f"start={int(alert.created_at.timestamp() * 1000)} "
        f"src={tgt} "
        f"msg={alert.data_found.replace('=', '_').replace('|', '_')} "
        f"cs1={alert.source} cs1Label=source "
        f"cs2={alert.id} cs2Label=alertId"
    )
    return f"CEF:0|BreachTower|SMB|1.0|{alert.source}|{alert.data_found[:50]}|{sev}|{ext}"


def send_siem_alert(alert, settings, target):
    url = settings.siem_webhook_url if settings else None
    if not url:
        return
    fmt = (settings.siem_format or "json").lower()
    try:
        if fmt == "cef":
            body = _to_cef(alert, target).encode("utf-8")
            content_type = "text/plain"
        else:
            body = json.dumps(_to_json(alert, target)).encode("utf-8")
            content_type = "application/json"

        req = urllib.request.Request(url, data=body, headers={"Content-Type": content_type})
        with urllib.request.urlopen(req, timeout=8):
            pass
        logger.info("SIEM alert sent for alert #%d", alert.id)
    except Exception as e:
        logger.warning("SIEM webhook failed for alert #%d: %s", alert.id, e)
