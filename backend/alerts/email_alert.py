import html
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from backend.db.models import Alert, Settings

logger = logging.getLogger(__name__)

SEVERITY_COLORS = {
    "CRITICAL": "#dc2626",
    "HIGH": "#ea580c",
    "MEDIUM": "#ca8a04",
    "LOW": "#2563eb",
}


def send_alert(alert: Alert, settings: Settings):
    if not settings.smtp_host or not settings.alert_email:
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[Breach Tower {alert.severity}] Credential exposure detected"
    msg["From"] = settings.smtp_user
    msg["To"] = settings.alert_email

    html = _build_html(alert)
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_pass)
            server.sendmail(settings.smtp_user, settings.alert_email, msg.as_string())
        logger.info("Email alert sent for alert ID %s", alert.id)
    except Exception as e:
        logger.error("Failed to send email alert: %s", e)


def _build_html(alert: Alert) -> str:
    color = SEVERITY_COLORS.get(alert.severity, "#6b7280")
    # HTML-escape all user-controlled / external data fields to prevent injection
    safe_severity      = html.escape(alert.severity or "")
    safe_source        = html.escape((alert.source or "").upper())
    safe_data_found    = html.escape(alert.data_found or "").replace("\n", "<br>")
    safe_remediation   = html.escape(alert.remediation_steps or "").replace("\n", "<br>")
    safe_detected      = html.escape(alert.created_at.strftime("%Y-%m-%d %H:%M UTC"))
    dashboard_url      = html.escape(
        __import__("os").getenv("DASHBOARD_URL", "http://localhost:3000")
    )
    return f"""
    <html><body style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
        <div style="background: {color}; padding: 20px 24px;">
          <h1 style="color: white; margin: 0; font-size: 20px;">
            Breach Tower Alert &mdash; {safe_severity}
          </h1>
        </div>
        <div style="padding: 24px;">
          <p><strong>Source:</strong> {safe_source}</p>
          <p><strong>Data Found:</strong><br>{safe_data_found}</p>
          <p><strong>Detected:</strong> {safe_detected}</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <h3 style="color: {color}; margin-top: 0;">Recommended Actions</h3>
          <p style="background: #f3f4f6; padding: 12px; border-radius: 6px;">
            {safe_remediation}
          </p>
          <p style="text-align: center; margin-top: 24px;">
            <a href="{dashboard_url}" style="background: {color}; color: white;
               padding: 10px 24px; border-radius: 6px; text-decoration: none;">
              View in Dashboard
            </a>
          </p>
        </div>
        <div style="background: #f3f4f6; padding: 12px 24px; font-size: 12px; color: #6b7280;">
          Breach Tower &mdash; for defensive monitoring only. Do not share this alert.
        </div>
      </div>
    </body></html>
    """
