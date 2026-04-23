import os
import re
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db.models import User, AuditLog, UserSession

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── crypto config ─────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("JWT_SECRET", "")
if not SECRET_KEY:
    import logging as _logging
    _log = _logging.getLogger(__name__)
    if os.getenv("ENVIRONMENT", "development").lower() == "production":
        # Fail fast in production — a missing JWT_SECRET is a critical misconfiguration
        raise RuntimeError(
            "FATAL: JWT_SECRET is not set. "
            "Set a strong random value in .env before running in production."
        )
    import secrets as _secrets
    SECRET_KEY = _secrets.token_hex(64)
    _log.warning(
        "JWT_SECRET not set — using a temporary random secret. "
        "All tokens will be invalidated on restart. Set JWT_SECRET in .env for production."
    )
ALGORITHM  = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # 8 hours

pwd_ctx    = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2     = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# ── .env path for vault password ──────────────────────────────────────────────
ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"


def _get_env_val(key: str) -> str:
    if not ENV_PATH.exists():
        return ""
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        if k.strip() == key:
            return v.strip()
    return ""


def _set_env_val(key: str, value: str) -> None:
    lines = ENV_PATH.read_text(encoding="utf-8").splitlines() if ENV_PATH.exists() else []
    written = False
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if not stripped.startswith("#") and "=" in stripped:
            k = stripped.split("=", 1)[0].strip()
            if k == key:
                new_lines.append(f"{key}={value}")
                written = True
                continue
        new_lines.append(line)
    if not written:
        new_lines.append(f"{key}={value}")
    ENV_PATH.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


# ── helpers ───────────────────────────────────────────────────────────────────

def log_audit(db: Session, user: "User | None", action: str, detail: str = "") -> None:
    db.add(AuditLog(
        user_id=user.id if user else None,
        user_email=user.email if user else None,
        action=action,
        detail=detail,
    ))
    db.commit()


def hash_password(plain: str) -> str:
    return pwd_ctx.hash(plain[:72])


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain[:72], hashed)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    jti = str(uuid.uuid4())
    to_encode.update({"exp": expire, "jti": jti})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def _record_session(db: Session, user: User, token: str, request: Request | None = None):
    import logging as _logging
    _log = _logging.getLogger(__name__)
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        jti = payload.get("jti")
        if not jti:
            return
        ip = request.client.host if request and request.client else None
        ua = request.headers.get("user-agent") if request else None
        db.add(UserSession(user_id=user.id, token_jti=jti, ip_address=ip, user_agent=ua))
        db.commit()
    except JWTError as e:
        _log.error("Session record failed (JWT error): %s", e)
    except Exception as e:
        _log.error("Session record failed: %s", e)


def get_current_user(token: str = Depends(oauth2), db: Session = Depends(get_db)) -> User:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        jti: str = payload.get("jti")
        if not email:
            raise exc
    except JWTError:
        raise exc
    user = db.query(User).filter(User.email == email, User.active == True).first()  # noqa: E712
    if not user:
        raise exc
    # Check session not revoked
    if jti:
        sess = db.query(UserSession).filter(UserSession.token_jti == jti).first()
        if sess:
            if sess.revoked:
                raise exc
            # Update last_seen
            sess.last_seen = datetime.utcnow()
            db.commit()
    return user


# ── schemas ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_name: str
    user_email: str
    user_role: str = "analyst"
    sso_provider: Optional[str] = None


class MeResponse(BaseModel):
    name: str
    email: str
    role: str
    sso_provider: Optional[str]


class ChangeVaultPasswordRequest(BaseModel):
    current_password: str
    new_password: str


class SSOTokenRequest(BaseModel):
    provider: str          # "microsoft"
    id_token: str
    name: Optional[str] = None
    email: Optional[str] = None


# ── password strength ─────────────────────────────────────────────────────────

def _validate_password(password: str) -> None:
    errors = []
    if len(password) < 8:
        errors.append("at least 8 characters")
    if not re.search(r"[A-Z]", password):
        errors.append("an uppercase letter")
    if not re.search(r"[a-z]", password):
        errors.append("a lowercase letter")
    if not re.search(r"\d", password):
        errors.append("a digit")
    if not re.search(r"[^A-Za-z0-9]", password):
        errors.append("a special character")
    if errors:
        raise HTTPException(
            status_code=400,
            detail=f"Password must contain: {', '.join(errors)}.",
        )


# ── routes ────────────────────────────────────────────────────────────────────

@router.post("/register", response_model=LoginResponse)
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    _validate_password(payload.password)
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="Email already registered.")
    # First user automatically becomes admin
    is_first = db.query(User).count() == 0
    user = User(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role="admin" if is_first else "analyst",
        active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    user.last_login = datetime.utcnow()
    db.commit()
    log_audit(db, user, "user_registered", f"New account: {user.email} (role={user.role})")
    token = create_access_token({"sub": user.email})
    _record_session(db, user, token, request)
    return LoginResponse(access_token=token, user_name=user.name, user_email=user.email, user_role=user.role)


@router.post("/login", response_model=LoginResponse)
def login(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username, User.active == True).first()  # noqa: E712
    if not user or not user.hashed_password or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    # If 2FA enabled, return a short-lived partial token — client must call /totp/verify next
    if user.totp_enabled:
        partial = jwt.encode(
            {"sub": user.email, "scope": "totp_pending",
             "exp": datetime.utcnow() + timedelta(minutes=5)},
            SECRET_KEY, algorithm=ALGORITHM,
        )
        return LoginResponse(
            access_token=partial,
            token_type="totp_pending",
            user_name=user.name,
            user_email=user.email,
            user_role=user.role,
        )
    user.last_login = datetime.utcnow()
    db.commit()
    log_audit(db, user, "user_login", "Password login")
    token = create_access_token({"sub": user.email})
    _record_session(db, user, token, request)
    return LoginResponse(access_token=token, user_name=user.name, user_email=user.email, user_role=user.role, sso_provider=user.sso_provider)


def _verify_microsoft_id_token(id_token: str) -> dict:
    """
    Validate a Microsoft id_token by fetching the JWKS from Microsoft and verifying
    the signature. Returns the decoded claims dict on success, raises HTTPException on failure.
    """
    import urllib.request as _urllib_request
    import json as _json
    from jose import jwk as _jwk, jwt as _jose_jwt, JWTError as _JWTError

    # Fetch Microsoft's public JWKS
    JWKS_URI = "https://login.microsoftonline.com/common/discovery/v2.0/keys"
    try:
        with _urllib_request.urlopen(JWKS_URI, timeout=5) as resp:
            jwks = _json.loads(resp.read())
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Could not fetch SSO signing keys: {e}")

    # Decode header to get kid
    try:
        header = _jose_jwt.get_unverified_header(id_token)
    except _JWTError:
        raise HTTPException(status_code=400, detail="Invalid SSO token format.")

    kid = header.get("kid")
    key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
    if not key:
        raise HTTPException(status_code=400, detail="SSO token signing key not found.")

    try:
        claims = _jose_jwt.decode(
            id_token,
            key,
            algorithms=["RS256"],
            options={"verify_aud": False},  # audience varies by tenant config
        )
    except _JWTError as e:
        raise HTTPException(status_code=401, detail=f"SSO token validation failed: {e}")

    return claims


@router.post("/sso", response_model=LoginResponse)
def sso_login(payload: SSOTokenRequest, request: Request, db: Session = Depends(get_db)):
    """
    Validates the Microsoft id_token server-side via JWKS before trusting any claims.
    The email/name in the payload are only used as fallback display values;
    identity is always extracted from the verified token claims.
    """
    if payload.provider != "microsoft":
        raise HTTPException(status_code=400, detail=f"Unsupported SSO provider: {payload.provider}")

    # Validate the token and extract claims from it — never trust client-supplied email
    claims = _verify_microsoft_id_token(payload.id_token)
    email = claims.get("preferred_username") or claims.get("email") or claims.get("upn")
    name  = claims.get("name") or (email.split("@")[0] if email else None)

    if not email:
        raise HTTPException(status_code=400, detail="Email claim missing from SSO token.")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        is_first = db.query(User).count() == 0
        user = User(
            name=name or email.split("@")[0],
            email=email,
            hashed_password=None,
            role="admin" if is_first else "analyst",
            sso_provider=payload.provider,
            active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        log_audit(db, user, "user_registered", f"SSO account: {user.email} via {payload.provider}")
    else:
        if not user.active:
            raise HTTPException(status_code=403, detail="Account is deactivated.")
        if not user.sso_provider:
            user.sso_provider = payload.provider
            db.commit()

    user.last_login = datetime.utcnow()
    db.commit()
    log_audit(db, user, "user_login", f"SSO login via {payload.provider}")
    token = create_access_token({"sub": user.email})
    _record_session(db, user, token, request)
    return LoginResponse(access_token=token, user_name=user.name, user_email=user.email, user_role=user.role, sso_provider=user.sso_provider)


@router.get("/me", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user)):
    return MeResponse(
        name=current_user.name,
        email=current_user.email,
        role=current_user.role,
        sso_provider=current_user.sso_provider,
    )


@router.post("/vault/change-password")
def change_vault_password(
    payload: ChangeVaultPasswordRequest,
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required.")
    stored = _get_env_val("VAULT_PASSWORD")
    if not stored:
        raise HTTPException(status_code=400, detail="Vault password not configured. Set VAULT_PASSWORD in .env first.")
    if payload.current_password != stored:
        raise HTTPException(status_code=403, detail="Current password is incorrect.")
    if len(payload.new_password) < 12:
        raise HTTPException(status_code=400, detail="New vault password must be at least 12 characters.")
    _set_env_val("VAULT_PASSWORD", payload.new_password)
    os.environ["VAULT_PASSWORD"] = payload.new_password
    log_audit(None, current_user, "vault_password_changed", "Vault password changed by admin")
    return {"detail": "Vault password updated."}


@router.post("/totp/setup")
def totp_setup(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Generate a new TOTP secret and return QR code URI. Does NOT enable 2FA yet."""
    import pyotp, qrcode, qrcode.image.svg, io, base64
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=current_user.email, issuer_name="Breach Tower")
    # Generate QR as base64 PNG
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()
    # Store pending secret (not yet enabled)
    current_user.totp_secret = secret
    current_user.totp_enabled = False
    db.commit()
    return {"secret": secret, "uri": uri, "qr_png_b64": qr_b64}


@router.post("/totp/confirm")
def totp_confirm(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verify a TOTP code to confirm setup and enable 2FA."""
    import pyotp
    code = str(payload.get("code", "")).strip()
    if not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="Run /totp/setup first.")
    totp = pyotp.TOTP(current_user.totp_secret)
    if not totp.verify(code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid TOTP code.")
    current_user.totp_enabled = True
    db.commit()
    log_audit(db, current_user, "totp_enabled", "2FA enabled")
    return {"detail": "Two-factor authentication enabled."}


@router.post("/totp/disable")
def totp_disable(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disable 2FA — requires current password for confirmation."""
    if not current_user.hashed_password:
        raise HTTPException(status_code=400, detail="SSO accounts cannot disable 2FA this way.")
    pw = payload.get("password", "")
    if not verify_password(pw, current_user.hashed_password):
        raise HTTPException(status_code=403, detail="Incorrect password.")
    current_user.totp_secret = None
    current_user.totp_enabled = False
    db.commit()
    log_audit(db, current_user, "totp_disabled", "2FA disabled")
    return {"detail": "Two-factor authentication disabled."}


@router.post("/totp/verify")
def totp_verify(payload: dict, request: Request, db: Session = Depends(get_db)):
    """Exchange a partial token (pre-2FA) + TOTP code for a full session token."""
    import pyotp
    partial_token = payload.get("partial_token", "")
    code = str(payload.get("code", "")).strip()
    try:
        data = jwt.decode(partial_token, SECRET_KEY, algorithms=[ALGORITHM])
        if data.get("scope") != "totp_pending":
            raise HTTPException(status_code=400, detail="Invalid partial token.")
        email = data.get("sub")
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired token.")
    user = db.query(User).filter(User.email == email, User.active == True).first()  # noqa: E712
    if not user or not user.totp_secret:
        raise HTTPException(status_code=400, detail="2FA not configured.")
    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid TOTP code.")
    user.last_login = datetime.utcnow()
    db.commit()
    log_audit(db, user, "user_login", "Password + 2FA login")
    token = create_access_token({"sub": user.email})
    _record_session(db, user, token, request)
    return LoginResponse(access_token=token, user_name=user.name, user_email=user.email, user_role=user.role, sso_provider=user.sso_provider)


@router.get("/totp/status")
def totp_status(current_user: User = Depends(get_current_user)):
    return {"totp_enabled": current_user.totp_enabled}


@router.post("/vault/verify")
def verify_vault_password(
    payload: dict,
    current_user: User = Depends(get_current_user),
):
    """Verify a vault password attempt — returns success/failure without exposing the password."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required.")
    attempt = payload.get("password", "")
    if not attempt:
        raise HTTPException(status_code=400, detail="Password required.")
    stored = _get_env_val("VAULT_PASSWORD")
    if not stored:
        raise HTTPException(status_code=400, detail="Vault password not configured.")
    import hmac as _hmac
    match = _hmac.compare_digest(attempt, stored)
    if not match:
        log_audit(None, current_user, "vault_unlock_failed", "Incorrect vault password attempt")
    return {"valid": match}
