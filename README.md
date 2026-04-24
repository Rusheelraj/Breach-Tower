<p align="center">
  <img src="frontend/public/logo-512.png" alt="Breach Tower" width="100" />
</p>

<h1 align="center">Breach Tower</h1>

<p align="center">
  <strong>Self-hosted dark web credential monitoring for small businesses.</strong>
</p>

---

Breach Tower continuously hunts breach databases, paste sites, stealer log Telegram channels, and live CTI threat feeds for your company's exposed credentials — then delivers actionable alerts before attackers can exploit them.

---

## What It Does

Most breach notification services are reactive: you find out months later via a news article. Breach Tower runs scheduled scans across **7 intelligence sources**, scores every finding by severity, and notifies your team via email or Slack in near real-time.

**Core loop:**
1. You add your domains and email patterns as monitored targets
2. The scheduler runs every 3–24 hours (configurable)
3. Each monitor searches for leaked credentials tied to your targets
4. Findings are scored (CRITICAL → LOW), deduplicated, and stored
5. Alerts are delivered to your inbox or Slack channel

---

## Intelligence Sources

| Monitor | Source | Requires Key |
|---|---|---|
| **Leak-Lookup** | Aggregated breach database | Yes |
| **LeakCheck** | Credential breach search (falls back to free public API) | Optional |
| **BreachDirectory** | Plaintext + hashed password dumps | Yes (RapidAPI) |
| **IntelligenceX** | Dark web / deep web search | Yes |
| **Telegram** | Stealer log channels (Telethon) | Yes (API ID/Hash) |
| **Paste Sites** | Pastebin scraping + DDG fallback | No |
| **CTI Feeds** | ctifeeds.andreafortuna.org (5 feeds) | No |

CTI Feeds covers: data leaks, phishing sites, underground data markets, ransomware victims, and website defacements.

> **LeakCheck** uses the authenticated API when a key is set, and automatically falls back to the free public endpoint (50 req/day) if the key is missing or invalid.

---

## Severity Scoring

Every finding is scored automatically:

| Score | Severity | Example |
|---|---|---|
| >= 70 | CRITICAL | Plaintext password in recent Telegram stealer log |
| 45-69 | HIGH | Password hash in breach database |
| 25-44 | MEDIUM | Email + domain in paste site dump |
| < 25 | LOW | Email-only exposure in old breach |

Scoring factors: data type (plaintext +40, hash +20, email +5), source priority, and recency bonus.

---

## Features

**Monitoring**
- 7 parallel intelligence monitors per scan cycle
- Per-target scan history and statistics
- Deduplication — no duplicate alerts for the same finding
- Manual scan trigger (all targets or single target)
- Scheduled one-off scans

**Alerting**
- Email (SMTP) with remediation steps
- Slack webhook with rich formatting
- SIEM webhook integration (JSON or CEF format)
- Configurable minimum severity threshold

**Dashboard & Reports**
- Real-time alert feed with severity filters
- Trend charts and source comparison analytics
- Alert acknowledgment and remediation workflow
- CSV and PDF export

**User Management**
- Role-based access: Admin and Analyst
- TOTP 2FA support
- Microsoft Entra ID / Azure AD SSO
- Active session tracking with IP logging
- Full audit trail of every action

**Security**
- Credential vault with server-side password verification
- All API keys masked in the UI by default
- JWT authentication + session revocation
- CORS enforcement via environment variable
- Alert retention policies (configurable)
- Atomic `.env` writes (no corruption on kill)
- Telegram session file protected with `chmod 600`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI + Uvicorn |
| Database | PostgreSQL + SQLAlchemy ORM |
| Scheduler | APScheduler |
| Frontend | React 18 + Vite 5 |
| Styling | Tailwind CSS 3 |
| Charts | Recharts |
| Auth | JWT (python-jose) + TOTP (pyotp) + MSAL |
| Telegram | Telethon |
| Containerization | Docker + Docker Compose |

---

## Quick Start — One-liner Installer (Linux)

The recommended way to install on any Linux server or VM:

```bash
cd /tmp && sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/Rusheelraj/Breach-Tower/main/install.sh)"
```

The installer will:
- Detect your distro (Ubuntu, Debian, Kali, Parrot, Fedora, Arch, etc.)
- Install Docker and Docker Compose v2 if not present
- Clone the repo to `/opt/breach-tower`
- Prompt for email, SMTP, and Slack settings
- Generate cryptographically strong secrets automatically
- Build and start all containers
- Wait for the health check to pass

> **Supported distros:** Ubuntu, Debian, Kali Linux, Parrot, Linux Mint, Pop!\_OS, Fedora, CentOS, Rocky, AlmaLinux, Arch, Manjaro, Raspberry Pi OS

### After install

```
Dashboard : http://localhost:3000
API Docs  : http://localhost:8000/docs
```

1. Open the dashboard and **register your admin account** (first user gets admin role)
2. Go to **Settings → Intelligence Sources** and enter your API keys
3. Go to **Settings → Telegram** to authenticate your Telegram session via the UI
4. Go to **Targets** and add your domains or email patterns
5. Run your first scan

### Update

```bash
sudo bash /opt/breach-tower/install.sh --update
```

### Uninstall

```bash
sudo bash /opt/breach-tower/install.sh --uninstall
```

---

## Manual Docker Setup

If you prefer to set up manually:

```bash
git clone https://github.com/Rusheelraj/Breach-Tower.git
cd Breach-Tower
cp .env.example .env
```

Edit `.env` with your configuration (see [Environment Variables](#environment-variables-reference) below), then:

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- API: http://localhost:8000

---

## Local Development Setup

Use `docker-compose.dev.yml` to run only PostgreSQL in Docker, and run the backend and frontend locally:

```bash
# Start only postgres
docker compose -f docker-compose.dev.yml up -d

# Backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # fill in values — use localhost:5432 for DATABASE_URL
uvicorn backend.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                     # dev server on :3000 with /api proxy to :8000
```

> The Vite dev server proxies `/api/*` to `http://localhost:8000` automatically.

---

## Adding Targets

Once logged in, go to **Targets** and add:

- **Domain** — e.g. `yourcompany.com` — monitors all credentials tied to this domain
- **Email pattern** — e.g. `*@yourcompany.com` — monitors all employee email addresses

The system will scan all configured monitors against every active target on each run.

---

## Configuring Monitors

Go to **Settings** and enter your API keys under each intelligence source. Monitors with no key configured are automatically skipped. Paste Sites and CTI Feeds require no key and are always active.

API keys saved via the Settings UI take effect on the **next scan** — no container restart required.

To disable a specific monitor without removing its key, toggle it off in **Settings → Enable / Disable** or set:

```env
DISABLED_MONITORS=breach,telegram
```

---

## Telegram Monitor Setup

The Telegram monitor uses [Telethon](https://github.com/LonamiWebs/Telethon) to watch public stealer log channels.

**Setup via the UI (recommended):**

1. Get your `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` from [my.telegram.org](https://my.telegram.org)
2. Go to **Settings → Telegram — Stealer Log Channels**
3. Enter your API ID and API Hash, then click **Save Configuration**
4. The **Session Authentication** panel will appear — enter your phone number and click **Send Code**
5. Enter the code received in your Telegram app and click **Verify**
6. Done — the monitor will scan on the next run

The session file is stored at `/opt/breach-tower/breachtower_session.session` (permissions `600`) and persists across container restarts via a Docker volume mount.

> The monitor only reads **public channels**. No private or invite-only channels are accessed.

---

## Project Structure

```
breach-tower/
├── backend/
│   ├── api/              # FastAPI route handlers
│   ├── alerts/           # Email, Slack, SIEM delivery
│   ├── db/               # SQLAlchemy models + database setup
│   ├── monitors/         # 7 intelligence monitor modules
│   ├── scoring/          # Severity scoring algorithm
│   ├── config.py
│   ├── main.py           # FastAPI app entrypoint
│   └── scheduler.py      # APScheduler job runner
├── frontend/
│   └── src/
│       ├── pages/        # React pages (Dashboard, Targets, Settings, etc.)
│       ├── auth/         # AuthContext, token validation
│       ├── api.js        # API client
│       └── App.jsx
├── .env.example
├── docker-compose.yml
├── docker-compose.dev.yml  # Dev: postgres only
├── install.sh              # One-liner Linux installer
└── requirements.txt
```

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `DB_PASSWORD` | Yes | Postgres password (used by docker-compose) |
| `JWT_SECRET` | Yes | Secret key for JWT signing (minimum 32 chars) |
| `VAULT_PASSWORD` | Yes | Password to unlock the credential vault in UI |
| `ENVIRONMENT` | No | Set to `production` to enforce JWT length and disable Swagger |
| `SMTP_HOST` | No | SMTP server hostname |
| `SMTP_PORT` | No | SMTP port (default 587) |
| `SMTP_USER` | No | SMTP login |
| `SMTP_PASS` | No | SMTP password or app password |
| `ALERT_EMAIL` | No | Recipient address for alert emails |
| `SLACK_WEBHOOK` | No | Slack incoming webhook URL |
| `LEAKLOOKUP_API_KEY` | No | Leak-Lookup API key |
| `LEAKCHECK_API_KEY` | No | LeakCheck API key (falls back to free tier if absent) |
| `INTELX_API_KEY` | No | IntelligenceX API key |
| `BREACH_DIRECTORY_KEY` | No | BreachDirectory / RapidAPI key |
| `TELEGRAM_API_ID` | No | Telegram API ID (from my.telegram.org) |
| `TELEGRAM_API_HASH` | No | Telegram API Hash |
| `PASTEBIN_API_KEY` | No | Pastebin API key (for scraping API access) |
| `PASTEBIN_API_USER_KEY` | No | Pastebin user key |
| `SCAN_INTERVAL_HOURS` | No | Hours between scheduled scans (default 6) |
| `DISABLED_MONITORS` | No | Comma-separated monitor keys to skip |
| `ALLOWED_ORIGINS` | No | CORS allowed origins (default http://localhost:3000) |
| `AZURE_CLIENT_ID` | No | Microsoft Entra App client ID (for SSO) |
| `AZURE_TENANT_ID` | No | Microsoft Entra tenant ID (for SSO) |

---

## Useful Commands

```bash
# View live backend logs
cd /opt/breach-tower && sudo docker-compose logs -f backend

# View all service logs
sudo docker-compose logs -f

# Stop all services
sudo docker-compose down

# Start services (after stop)
sudo docker-compose up -d

# Rebuild after code changes
sudo docker-compose up -d --build

# Update to latest version
sudo bash /opt/breach-tower/install.sh --update

# Full uninstall (removes all data)
sudo bash /opt/breach-tower/install.sh --uninstall
```

---

## Security Notes

- **Never commit `.env`** — it contains secrets. It is excluded by `.gitignore` by default.
- `JWT_SECRET` must be at least 32 characters in production — the app will refuse to start if it is too short or missing.
- Generate a strong JWT secret: `python3 -c "import secrets; print(secrets.token_hex(64))"`
- The credential vault uses `hmac.compare_digest` (timing-safe comparison) for password verification.
- Set `ENVIRONMENT=production` to disable the `/docs` and `/redoc` Swagger endpoints.
- Restrict `ALLOWED_ORIGINS` to your actual frontend domain in production.
- Do not expose port 8000 directly to the internet — put it behind a reverse proxy (nginx, Caddy).
- The Telegram session file is stored with `chmod 600` — owner read/write only.

---

## License

Private — all rights reserved.

---

*Built for defensive security operations. Monitor your own assets only.*
