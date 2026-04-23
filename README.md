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
| **LeakCheck** | Credential breach search | Yes |
| **BreachDirectory** | Plaintext + hashed password dumps | Yes |
| **IntelligenceX** | Dark web / deep web search | Yes |
| **Telegram** | Stealer log channels (Telethon) | Yes (API ID/Hash) |
| **Paste Sites** | Pastebin scraping + DDG fallback | No |
| **CTI Feeds** | ctifeeds.andreafortuna.org (5 feeds) | No |

CTI Feeds covers: data leaks, phishing sites, underground data markets, ransomware victims, and website defacements.

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
- Security headers (X-Frame-Options, X-Content-Type-Options, etc.)
- CORS enforcement via environment variable
- JWT authentication + session revocation
- Alert retention policies (configurable)

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

## Quick Start

### Prerequisites
- Docker and Docker Compose
- API keys for the monitors you want to enable (all optional — the system runs with whatever you configure)

### 1. Clone and configure

```bash
git clone https://github.com/YOUR_USERNAME/breach-tower.git
cd breach-tower
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Database
DATABASE_URL=postgresql://admin:yourpassword@db:5432/breachtower
DB_PASSWORD=yourpassword

# Auth
JWT_SECRET=generate-a-strong-random-secret-here
VAULT_PASSWORD=your-vault-password

# SMTP alerts
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@yourcompany.com
SMTP_PASS=your-app-password
ALERT_EMAIL=security@yourcompany.com

# Slack (optional)
SLACK_WEBHOOK=https://hooks.slack.com/services/...

# Intelligence API keys (all optional — enable what you have)
LEAKLOOKUP_API_KEY=
LEAKCHECK_API_KEY=
INTELX_API_KEY=
BREACH_DIRECTORY_KEY=
TELEGRAM_API_ID=
TELEGRAM_API_HASH=

# Scan interval in hours (3, 6, 12, or 24)
SCAN_INTERVAL_HOURS=6

# Comma-separated list of monitors to disable
# DISABLED_MONITORS=breach,telegram

# CORS
ALLOWED_ORIGINS=http://localhost:3000
```

### 2. Start

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- API: http://localhost:8000

### 3. Create your first admin user

On first launch, register through the UI. The first registered user is granted the admin role automatically.

---

## Manual Setup (without Docker)

### Backend

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # fill in your values
uvicorn backend.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
cp .env.example .env            # set VITE_API_URL if needed
npm install
npm run dev                     # dev server on :3000
```

---

## Adding Targets

Once logged in, go to **Targets** and add:

- **Domain** — e.g. `yourcompany.com` — monitors all credentials tied to this domain
- **Email pattern** — e.g. `*@yourcompany.com` — monitors all employee email addresses

The system will scan all configured monitors against every active target on each run.

---

## Configuring Monitors

Go to **Settings** and enter your API keys under each intelligence source. Monitors with no key configured are automatically skipped. Paste Sites and CTI Feeds require no key and are always active.

To disable a specific monitor without removing its key:

```env
DISABLED_MONITORS=breach,telegram
```

---

## Telegram Monitor Setup

The Telegram monitor uses [Telethon](https://github.com/LonamiWebs/Telethon) to watch public stealer log channels.

1. Get your `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` from [my.telegram.org](https://my.telegram.org)
2. Set them in `.env`
3. On first run, Telethon will prompt for your phone number to create a session file
4. The session file is stored locally and excluded from git

> The monitor only reads public channels. No private channels are accessed.

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
│       ├── api.js        # API client
│       └── App.jsx
├── .env.example
├── docker-compose.yml
└── requirements.txt
```

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret key for JWT signing |
| `VAULT_PASSWORD` | Yes | Password to unlock the credential vault in UI |
| `SMTP_HOST` | No | SMTP server hostname |
| `SMTP_PORT` | No | SMTP port (default 587) |
| `SMTP_USER` | No | SMTP login |
| `SMTP_PASS` | No | SMTP password |
| `ALERT_EMAIL` | No | Recipient address for alert emails |
| `SLACK_WEBHOOK` | No | Slack incoming webhook URL |
| `LEAKLOOKUP_API_KEY` | No | Leak-Lookup API key |
| `LEAKCHECK_API_KEY` | No | LeakCheck API key |
| `INTELX_API_KEY` | No | IntelligenceX API key |
| `BREACH_DIRECTORY_KEY` | No | BreachDirectory / RapidAPI key |
| `TELEGRAM_API_ID` | No | Telegram API ID (from my.telegram.org) |
| `TELEGRAM_API_HASH` | No | Telegram API Hash |
| `SCAN_INTERVAL_HOURS` | No | Hours between scans (default 6) |
| `DISABLED_MONITORS` | No | Comma-separated monitors to skip |
| `ALLOWED_ORIGINS` | No | CORS allowed origins (default http://localhost:3000) |
| `ENVIRONMENT` | No | Set to `production` to disable Swagger docs |

---

## Security Notes

- **Never commit `.env`** — it contains secrets. It is in `.gitignore` by default.
- Set a strong `JWT_SECRET` in production — the system will warn if it falls back to a random value.
- The credential vault UI requires server-side password verification via `hmac.compare_digest` (timing-safe comparison).
- Set `ENVIRONMENT=production` to disable the `/docs` and `/redoc` Swagger endpoints.
- Restrict `ALLOWED_ORIGINS` to your actual frontend domain in production.
- Do not expose port 8000 directly to the internet — put it behind a reverse proxy (nginx, Caddy).

---

## License

Private — all rights reserved.

---

*Built for defensive security operations. Monitor your own assets only.*
