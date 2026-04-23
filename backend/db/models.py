from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from backend.db.database import Base



class Target(Base):
    __tablename__ = "targets"

    id = Column(Integer, primary_key=True, index=True)
    domain = Column(String, nullable=True, index=True)
    email_pattern = Column(String, nullable=True, index=True)
    added_at = Column(DateTime, default=datetime.utcnow)
    active = Column(Boolean, default=True)

    alerts = relationship("Alert", back_populates="target")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    target_id = Column(Integer, ForeignKey("targets.id"), nullable=False)
    source = Column(String, nullable=False)  # hibp, paste, telegram, breach
    data_found = Column(Text, nullable=False)  # masked credential info
    severity = Column(String, nullable=False)  # CRITICAL, HIGH, MEDIUM, LOW
    raw_data = Column(Text, nullable=True)
    remediation_steps = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    acknowledged = Column(Boolean, default=False)

    dedup_hash = Column(String, nullable=True, index=True)  # sha256(target_id+source+data_found)

    # Assignment + remediation notes
    assigned_to_id    = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_at       = Column(DateTime, nullable=True)
    remediation_note  = Column(Text, nullable=True)
    note_updated_at   = Column(DateTime, nullable=True)
    note_updated_by   = Column(String, nullable=True)  # email of last editor

    target      = relationship("Target", back_populates="alerts")
    assigned_to = relationship("User", foreign_keys=[assigned_to_id])


class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String, nullable=False)
    email           = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)   # null for SSO-only users
    role            = Column(String, default="analyst")  # admin | analyst
    sso_provider    = Column(String, nullable=True)    # "microsoft" | null
    active          = Column(Boolean, default=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    last_login      = Column(DateTime, nullable=True)
    totp_secret     = Column(String, nullable=True)   # base32 secret; null = 2FA not enabled
    totp_enabled    = Column(Boolean, default=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=True)
    user_email = Column(String, nullable=True)
    action     = Column(String, nullable=False)   # e.g. "scan_run", "alert_ack", "settings_change"
    detail     = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")


class ScanHistory(Base):
    __tablename__ = "scan_history"

    id         = Column(Integer, primary_key=True, index=True)
    target_id  = Column(Integer, ForeignKey("targets.id"), nullable=False)
    monitor    = Column(String, nullable=True)   # hibp, paste, telegram, breach — null = all
    findings   = Column(Integer, default=0)
    status     = Column(String, default="ok")    # ok | error
    error_msg  = Column(Text, nullable=True)
    ran_at     = Column(DateTime, default=datetime.utcnow)

    target = relationship("Target")


class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    smtp_host = Column(String, nullable=True)
    smtp_port = Column(Integer, default=587)
    smtp_user = Column(String, nullable=True)
    smtp_pass = Column(String, nullable=True)
    alert_email = Column(String, nullable=True)
    slack_webhook = Column(String, nullable=True)
    scan_interval_hours = Column(Integer, default=6)
    min_severity_to_alert = Column(String, default="HIGH")
    alert_retention_days = Column(Integer, default=0)      # 0 = keep forever
    siem_webhook_url = Column(String, nullable=True)
    siem_format = Column(String, default="json")           # json | cef


class TelegramChannel(Base):
    __tablename__ = "telegram_channels"

    id         = Column(Integer, primary_key=True, index=True)
    username   = Column(String, unique=True, nullable=False)   # @DaisyLogsUpdate
    label      = Column(String, nullable=True)
    enabled    = Column(Boolean, default=True)
    added_at   = Column(DateTime, default=datetime.utcnow)


class UserSession(Base):
    __tablename__ = "user_sessions"

    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id"), nullable=False)
    token_jti    = Column(String, unique=True, index=True, nullable=False)  # JWT ID claim
    ip_address   = Column(String, nullable=True)
    user_agent   = Column(String, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)
    last_seen    = Column(DateTime, default=datetime.utcnow)
    revoked      = Column(Boolean, default=False)

    user = relationship("User")


class ScheduledScan(Base):
    __tablename__ = "scheduled_scans"

    id           = Column(Integer, primary_key=True, index=True)
    run_at       = Column(DateTime, nullable=False)
    target_id    = Column(Integer, ForeignKey("targets.id"), nullable=True)  # null = all targets
    monitor      = Column(String, nullable=True)   # null = all monitors
    status       = Column(String, default="pending")   # pending | running | done | cancelled
    created_by   = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)

    target = relationship("Target")
    creator = relationship("User")
