"""
Alert deduplication helper.

An alert is a duplicate if:
  - same target_id, source, and data_found (via sha256 hash)
  - AND an existing alert with that hash is already acknowledged

If the same breach appears again but was never acknowledged, we still
suppress it to avoid spam — the original open alert is the actionable item.
"""
import hashlib
from sqlalchemy.orm import Session
from backend.db.models import Alert


def make_dedup_hash(target_id: int, source: str, data_found: str) -> str:
    raw = f"{target_id}|{source}|{data_found}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def is_duplicate(db: Session, target_id: int, source: str, data_found: str) -> bool:
    """Return True if an alert with this exact fingerprint already exists (open or acked)."""
    h = make_dedup_hash(target_id, source, data_found)
    return db.query(Alert).filter(Alert.dedup_hash == h).first() is not None


def make_alert(target_id: int, source: str, data_found: str, **kwargs) -> Alert:
    h = make_dedup_hash(target_id, source, data_found)
    return Alert(
        target_id=target_id,
        source=source,
        data_found=data_found,
        dedup_hash=h,
        **kwargs,
    )
