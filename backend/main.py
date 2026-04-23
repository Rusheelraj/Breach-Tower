import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from backend.db.database import init_db
from backend.api import (
    routes_dashboard, routes_targets, routes_settings, routes_env,
    routes_auth, routes_users, routes_audit,
    routes_telegram, routes_scheduled_scans, routes_sessions,
    routes_alerts, routes_reports,
)
from backend.api.routes_auth import get_current_user
from backend.db.models import User
from backend import scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to every response."""
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    scheduler.start_scheduler()
    yield
    scheduler.stop_scheduler()


app = FastAPI(
    title="Breach Tower API",
    description="Dark web credential monitoring for small businesses",
    version="1.0.0",
    lifespan=lifespan,
    # Disable automatic OpenAPI docs in production
    docs_url="/docs" if os.getenv("ENVIRONMENT", "development") == "development" else None,
    redoc_url="/redoc" if os.getenv("ENVIRONMENT", "development") == "development" else None,
)

# Security headers on all responses
app.add_middleware(SecurityHeadersMiddleware)

# CORS — read allowed origins from environment
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(routes_auth.router)
app.include_router(routes_dashboard.router)
app.include_router(routes_targets.router)
app.include_router(routes_settings.router)
app.include_router(routes_env.router)
app.include_router(routes_users.router)
app.include_router(routes_audit.router)
app.include_router(routes_telegram.router)
app.include_router(routes_scheduled_scans.router)
app.include_router(routes_sessions.router)
app.include_router(routes_alerts.router)
app.include_router(routes_reports.router)


@app.post("/api/scan/run")
def trigger_manual_scan(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin role required.")
    import threading
    threading.Thread(target=scheduler.run_all_monitors, daemon=True).start()
    return {"status": "scan initiated"}


@app.post("/api/scan/run/{target_id}")
def trigger_target_scan(
    target_id: int,
    monitor: str = None,
    current_user: User = Depends(get_current_user),
):
    import threading
    from fastapi import HTTPException
    from backend.db.database import SessionLocal
    from backend.db.models import Target
    db = SessionLocal()
    target = db.query(Target).filter(Target.id == target_id, Target.active == True).first()  # noqa: E712
    db.close()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    threading.Thread(
        target=scheduler.run_monitors_for_targets,
        args=([target],),
        kwargs={"only_monitor": monitor},
        daemon=True,
    ).start()
    return {"status": "scan initiated", "target_id": target_id, "monitor": monitor}


@app.get("/api/scan/status")
def scan_status(current_user: User = Depends(get_current_user)):
    return scheduler.get_scan_status()


@app.get("/health")
def health():
    return {"status": "ok"}
