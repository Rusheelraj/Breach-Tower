import smtplib
import json
import urllib.request
import urllib.error
from email.mime.text import MIMEText
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from backend.db.database import get_db
from backend.db.models import Settings, User
from backend import scheduler as sched_module
from backend.api.routes_auth import get_current_user, log_audit

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsOut(BaseModel):
    smtp_host: Optional[str]
    smtp_port: int
    smtp_user: Optional[str]
    alert_email: Optional[str]
    slack_webhook: Optional[str]
    scan_interval_hours: int
    min_severity_to_alert: str
    alert_retention_days: int
    siem_webhook_url: Optional[str]
    siem_format: str

    class Config:
        from_attributes = True


class SettingsUpdate(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_pass: Optional[str] = None
    alert_email: Optional[str] = None
    slack_webhook: Optional[str] = None
    scan_interval_hours: Optional[int] = None
    min_severity_to_alert: Optional[str] = None
    alert_retention_days: Optional[int] = None
    siem_webhook_url: Optional[str] = None
    siem_format: Optional[str] = None


def _require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required.")
    return current_user


@router.get("", response_model=SettingsOut)
def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = db.query(Settings).first()
    if not settings:
        settings = Settings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.post("", response_model=SettingsOut)
def update_settings(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    settings = db.query(Settings).first()
    if not settings:
        settings = Settings()
        db.add(settings)

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(settings, field, value)

    db.commit()
    db.refresh(settings)

    if payload.scan_interval_hours:
        sched_module.update_interval(payload.scan_interval_hours)

    return settings


@router.post("/test/email")
def test_email(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required.")
    settings = db.query(Settings).first()
    if not settings or not settings.smtp_host or not settings.alert_email:
        raise HTTPException(status_code=400, detail="SMTP host and alert email must be configured first.")

    try:
        msg = MIMEText(
            "This is a test notification from Breach Tower.\n\n"
            "If you received this, your email alert configuration is working correctly.",
            "plain",
        )
        msg["Subject"] = "[Breach Tower] Test Notification"
        msg["From"] = settings.smtp_user or "breachtower@localhost"
        msg["To"] = settings.alert_email

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port or 587, timeout=10) as smtp:
            smtp.ehlo()
            smtp.starttls()
            if settings.smtp_user and settings.smtp_pass:
                smtp.login(settings.smtp_user, settings.smtp_pass)
            smtp.sendmail(msg["From"], [msg["To"]], msg.as_string())

        log_audit(db, current_user, "test_email_sent", f"Test email sent to {settings.alert_email}")
        return {"status": "ok", "detail": f"Test email sent to {settings.alert_email}"}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"SMTP error: {exc}")


@router.post("/test/webhook")
def test_webhook(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required.")
    settings = db.query(Settings).first()
    if not settings or not settings.slack_webhook:
        raise HTTPException(status_code=400, detail="Slack webhook URL must be configured first.")

    payload = json.dumps({
        "text": "*[Breach Tower]* Test webhook — your Slack notification is configured correctly. :white_check_mark:"
    }).encode("utf-8")

    try:
        req = urllib.request.Request(
            settings.slack_webhook,
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode()
        if body.strip() != "ok":
            raise HTTPException(status_code=502, detail=f"Slack responded: {body}")
        log_audit(db, current_user, "test_webhook_sent", "Test Slack webhook sent")
        return {"status": "ok", "detail": "Test webhook delivered successfully."}
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"Webhook error: {exc.reason}")
