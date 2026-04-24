# =============================================================================
#  Breach Tower -- One-liner Installer for Windows (PowerShell)
#  Run from an elevated PowerShell prompt:
#    Set-ExecutionPolicy Bypass -Scope Process -Force
#    irm https://raw.githubusercontent.com/Rusheelraj/Breach-Tower/main/install.ps1 | iex
#
#  Or if running locally:
#    PowerShell -ExecutionPolicy Bypass -File install.ps1
#    PowerShell -ExecutionPolicy Bypass -File install.ps1 -Update
#    PowerShell -ExecutionPolicy Bypass -File install.ps1 -Uninstall
# =============================================================================

param(
    [switch]$Update,
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

# -- Constants -----------------------------------------------------------------
$INSTALL_DIR  = "C:\breach-tower"
$REPO_URL     = "https://github.com/Rusheelraj/Breach-Tower.git"
$SESSION_FILE = "$INSTALL_DIR\breachtower_session.session"

# -- Colours -------------------------------------------------------------------
function Write-Info    { param($msg) Write-Host "[*] $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Warn    { param($msg) Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Err     { param($msg) Write-Host "[-] $msg" -ForegroundColor Red }
function Write-Step    { param($msg) Write-Host "`n>>> $msg <<<`n" -ForegroundColor White }

function Pause-AndExit {
    param([int]$Code = 0)
    Write-Host ""
    Write-Host "  Press any key to close this window..." -ForegroundColor DarkGray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit $Code
}

function Die {
    param($msg)
    Write-Err $msg
    Write-Host ""
    Pause-AndExit 1
}

# -- Banner --------------------------------------------------------------------
function Print-Banner {
    Write-Host ""
    Write-Host "  ██████╗ ██████╗ ███████╗ █████╗  ██████╗██╗  ██╗" -ForegroundColor Red
    Write-Host "  ██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔════╝██║  ██║" -ForegroundColor Red
    Write-Host "  ██████╔╝██████╔╝█████╗  ███████║██║     ███████║" -ForegroundColor Red
    Write-Host "  ██╔══██╗██╔══██╗██╔══╝  ██╔══██║██║     ██╔══██║" -ForegroundColor Red
    Write-Host "  ██████╔╝██║  ██║███████╗██║  ██║╚██████╗██║  ██║" -ForegroundColor Red
    Write-Host "  ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝" -ForegroundColor Red
    Write-Host ""
    Write-Host "  ████████╗ ██████╗ ██╗    ██╗███████╗██████╗ " -ForegroundColor Red
    Write-Host "  ╚══██╔══╝██╔═══██╗██║    ██║██╔════╝██╔══██╗" -ForegroundColor Red
    Write-Host "     ██║   ██║   ██║██║ █╗ ██║█████╗  ██████╔╝" -ForegroundColor Red
    Write-Host "     ██║   ██║   ██║██║███╗██║██╔══╝  ██╔══██╗" -ForegroundColor Red
    Write-Host "     ██║   ╚██████╔╝╚███╔███╔╝███████╗██║  ██║" -ForegroundColor Red
    Write-Host "     ╚═╝    ╚═════╝  ╚══╝╚══╝ ╚══════╝╚═╝  ╚═╝" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Self-hosted dark web threat intelligence platform" -ForegroundColor DarkGray
    Write-Host "  https://github.com/Rusheelraj/Breach-Tower" -ForegroundColor DarkGray
    Write-Host ""
}

# -- Require Administrator -----------------------------------------------------
function Require-Admin {
    $currentPrincipal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Die "This installer must be run as Administrator. Right-click PowerShell and choose 'Run as Administrator'."
    }
}

# -- Check / Install Winget ----------------------------------------------------
function Ensure-Winget {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Success "winget is available."
        return
    }
    Write-Warn "winget not found. Please install 'App Installer' from the Microsoft Store, then re-run."
    Write-Host "  https://apps.microsoft.com/store/detail/app-installer/9NBLGGH4NNS1" -ForegroundColor Cyan
    Die "winget is required to install dependencies automatically."
}

# -- Install Git ---------------------------------------------------------------
function Install-GitIfMissing {
    if (Get-Command git -ErrorAction SilentlyContinue) {
        Write-Success "Git already installed: $(git --version)"
        return
    }
    Write-Info "Installing Git for Windows..."
    winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements
    # Refresh PATH so git is available in this session
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("PATH", "User")
    if (Get-Command git -ErrorAction SilentlyContinue) {
        Write-Success "Git installed: $(git --version)"
    } else {
        Die "Git installation failed. Please install manually from https://git-scm.com and re-run."
    }
}

# -- Install Docker Desktop ----------------------------------------------------
function Install-DockerIfMissing {
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        $dockerVer = (docker --version) -replace "Docker version ", "" -replace ",.*", ""
        Write-Success "Docker already installed: v$dockerVer"
        return
    }

    Write-Info "Docker not found. Checking if Docker Desktop can be installed via winget..."

    # Check Windows version (Docker Desktop requires Windows 10 2004+ / 11)
    $winBuild = [System.Environment]::OSVersion.Version.Build
    if ($winBuild -lt 19041) {
        Write-Warn "Windows build $winBuild detected. Docker Desktop requires build 19041 (20H1) or newer."
        Write-Warn "Please upgrade Windows or install Docker Desktop manually from:"
        Write-Host "  https://www.docker.com/products/docker-desktop/" -ForegroundColor Cyan
        Die "Windows version too old for automatic Docker Desktop install."
    }

    # Check if WSL2 is available (required by Docker Desktop on Windows)
    $wslStatus = wsl --status 2>&1
    if ($LASTEXITCODE -ne 0 -or ($wslStatus -match "not installed")) {
        Write-Info "Enabling WSL2 (required by Docker Desktop)..."
        wsl --install --no-distribution
        Write-Warn "WSL2 has been installed. A system RESTART may be required."
        Write-Warn "After restarting, re-run this installer to continue."
        Die "Please restart your computer and re-run the installer."
    }

    Write-Info "Installing Docker Desktop via winget (this may take several minutes)..."
    winget install --id Docker.DockerDesktop -e --silent --accept-package-agreements --accept-source-agreements

    Write-Success "Docker Desktop installed. Launching it now..."
    Start-DockerDesktop
}

# -- Start Docker Desktop and wait for daemon ----------------------------------
function Start-DockerDesktop {
    # Find the Docker Desktop executable
    $dockerExe = @(
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if (-not $dockerExe) {
        Die "Docker Desktop executable not found. Please launch Docker Desktop manually and re-run."
    }

    # Check if Docker Desktop process is already running
    $running = Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue
    if (-not $running) {
        Write-Info "Starting Docker Desktop..."
        Start-Process $dockerExe
    } else {
        Write-Info "Docker Desktop process is already running. Waiting for daemon..."
    }

    # Poll until docker info succeeds (daemon ready), timeout 120s
    Write-Info "Waiting for Docker daemon to become ready (this can take up to 60 seconds)..."
    $timeout = 120
    $elapsed = 0
    $interval = 5
    while ($elapsed -lt $timeout) {
        Start-Sleep -Seconds $interval
        $elapsed += $interval
        $result = docker info 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Docker daemon is ready."
            return
        }
        if ($elapsed % 20 -eq 0) {
            Write-Info "Still waiting for Docker... ($elapsed/$timeout s)"
        }
    }
    Die "Docker daemon did not start within $timeout seconds. Try launching Docker Desktop manually and re-run."
}

# -- Verify Docker is running --------------------------------------------------
function Assert-DockerRunning {
    Write-Info "Checking Docker daemon..."
    $result = docker info 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Docker daemon is running."
        return
    }

    # Not running — try to start it automatically
    Write-Warn "Docker daemon is not running. Attempting to start Docker Desktop..."
    Start-DockerDesktop
}

# -- Check Docker Compose ------------------------------------------------------
function Assert-DockerCompose {
    # Prefer Docker Compose v2 plugin (bundled with Docker Desktop)
    $composeV2 = docker compose version 2>&1
    if ($LASTEXITCODE -eq 0) {
        $ver = ($composeV2 | Select-String -Pattern "[0-9]+\.[0-9]+\.[0-9]+").Matches[0].Value
        Write-Success "Docker Compose v2 available: $ver"
        return
    }
    Die "Docker Compose not found. Docker Desktop should bundle it. Try reinstalling Docker Desktop."
}

# -- Clone / update repo -------------------------------------------------------
function Clone-Or-Update-Repo {
    if (Test-Path "$INSTALL_DIR\.git") {
        Write-Info "Breach Tower already cloned. Pulling latest changes..."
        git -C $INSTALL_DIR reset --hard HEAD
        git -C $INSTALL_DIR clean -fd
        git -C $INSTALL_DIR pull --ff-only
        Write-Success "Repository updated."
    } else {
        Write-Info "Cloning Breach Tower into $INSTALL_DIR ..."
        if (-not (Test-Path $INSTALL_DIR)) {
            New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
        }
        git clone $REPO_URL $INSTALL_DIR
        Write-Success "Repository cloned."
    }
}

# -- Generate secure random strings --------------------------------------------
function New-RandomSecret {
    param([int]$Bytes = 64)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $buf = New-Object byte[] $Bytes
    $rng.GetBytes($buf)
    return [System.BitConverter]::ToString($buf).Replace("-", "").ToLower()
}

function New-RandomPassword {
    param([int]$Length = 24)
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $buf = New-Object byte[] $Length
    $rng.GetBytes($buf)
    $result = ""
    foreach ($b in $buf) {
        $result += $chars[$b % $chars.Length]
    }
    return $result
}

# -- Interactive .env setup ----------------------------------------------------
function Configure-Env {
    $envFile = "$INSTALL_DIR\.env"

    if (Test-Path $envFile) {
        Write-Warn ".env already exists at $envFile"
        $overwrite = Read-Host "[?] Overwrite it? (y/N)"
        if ($overwrite -notmatch "^[Yy]$") {
            Write-Info "Keeping existing .env."
            return $false
        }
    }

    Write-Host ""
    Write-Info "Generating secure secrets automatically..."
    $DB_PASSWORD   = New-RandomPassword
    $JWT_SECRET    = New-RandomSecret
    $VAULT_PASSWORD = New-RandomPassword
    Write-Success "Secrets generated."

    Write-Host ""
    Write-Step "Configuration"
    Write-Info "Press Enter to skip optional fields -- configure them later in Settings."
    Write-Host ""

    $ALERT_EMAIL   = Read-Host "[?] Admin alert email (where breach alerts are sent)"
    $SMTP_HOST     = Read-Host "[?] SMTP host (e.g. smtp.gmail.com) [optional, press Enter to skip]"
    $SMTP_PORT_IN  = Read-Host "[?] SMTP port [587]"
    $SMTP_PORT     = if ($SMTP_PORT_IN) { $SMTP_PORT_IN } else { "587" }
    $SMTP_USER     = Read-Host "[?] SMTP username / email [optional]"
    $SMTP_PASS     = Read-Host "[?] SMTP password / app password [optional]"
    $SLACK_WEBHOOK = Read-Host "[?] Slack webhook URL [optional]"
    $DASHBOARD_IN  = Read-Host "[?] Dashboard public URL (e.g. https://yourdomain.com) [http://localhost:3000]"
    $DASHBOARD_URL = if ($DASHBOARD_IN) { $DASHBOARD_IN } else { "http://localhost:3000" }

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    $envContent = @"
# =============================================================================
# Breach Tower -- Auto-generated by installer on $timestamp
# =============================================================================

# -- Database -----------------------------------------------------------------
DB_PASSWORD=$DB_PASSWORD
DATABASE_URL=postgresql://admin:${DB_PASSWORD}@postgres:5432/breachtower

# -- Auth ---------------------------------------------------------------------
JWT_SECRET=$JWT_SECRET
VAULT_PASSWORD=$VAULT_PASSWORD

# -- SMTP ---------------------------------------------------------------------
SMTP_HOST=$SMTP_HOST
SMTP_PORT=$SMTP_PORT
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
ALERT_EMAIL=$ALERT_EMAIL

# -- Slack --------------------------------------------------------------------
SLACK_WEBHOOK=$SLACK_WEBHOOK

# -- Dashboard ----------------------------------------------------------------
DASHBOARD_URL=$DASHBOARD_URL
ALLOWED_ORIGINS=$DASHBOARD_URL

# -- Scan config --------------------------------------------------------------
SCAN_INTERVAL_HOURS=6
DISABLED_MONITORS=

# -- Intelligence API keys (configure in Settings after install) --------------
HIBP_API_KEY=
BREACH_DIRECTORY_KEY=
LEAKCHECK_API_KEY=
INTELX_API_KEY=
LEAKLOOKUP_API_KEY=
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
PASTEBIN_API_KEY=
PASTEBIN_API_USER_KEY=

# -- Microsoft SSO (optional) -------------------------------------------------
AZURE_CLIENT_ID=
AZURE_TENANT_ID=

# -- Environment --------------------------------------------------------------
ENVIRONMENT=production
"@

    # Write as UTF-8 without BOM (important for Python's dotenv parser)
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($envFile, $envContent, $utf8NoBom)
    Write-Success ".env created at $envFile"
    return $true
}

# -- Ensure Telegram session file exists as a file (not a dir) ----------------
function Ensure-SessionFile {
    if (-not (Test-Path $SESSION_FILE)) {
        New-Item -ItemType File -Path $SESSION_FILE -Force | Out-Null
        Write-Info "Created empty Telegram session placeholder (authenticate via Settings after install)."
    } elseif ((Get-Item $SESSION_FILE).PSIsContainer) {
        # Docker created it as a directory — remove and recreate as file
        Remove-Item $SESSION_FILE -Recurse -Force
        New-Item -ItemType File -Path $SESSION_FILE -Force | Out-Null
        Write-Warn "Replaced Telegram session directory with an empty file."
    }
}

# -- Build and start -----------------------------------------------------------
function Build-And-Start {
    param([bool]$FreshEnv)

    Write-Step "Building and Starting Breach Tower"
    Push-Location $INSTALL_DIR

    try {
        # Check if containers are already running
        $running = docker compose ps --services --filter status=running 2>$null
        $hasRunning = ($running -and $running.Trim() -ne "")

        if ($hasRunning) {
            Write-Info "Stopping existing containers..."
            if ($FreshEnv) {
                Write-Warn "New .env detected -- wiping old database volume to avoid password mismatch..."
                docker compose down -v
            } else {
                docker compose down
            }
        } elseif ($FreshEnv) {
            Write-Info "Removing any stale database volume..."
            docker compose down -v 2>$null
        }

        Ensure-SessionFile

        Write-Info "Building Docker images (this may take a few minutes on first run)..."
        docker compose build --no-cache

        Write-Info "Starting all services..."
        docker compose up -d

        Write-Success "All services started."
    } finally {
        Pop-Location
    }
}

# -- Wait for backend health check --------------------------------------------
function Wait-ForHealthy {
    Write-Info "Waiting for services to become healthy..."
    $retries = 40
    $count   = 0

    while ($count -lt $retries) {
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
            if ($resp.StatusCode -eq 200) {
                Write-Success "Backend is up and healthy."
                return
            }
        } catch {}

        Start-Sleep -Seconds 3
        $count++
        if ($count % 5 -eq 0) {
            Write-Info "Still waiting... ($count/$retries)"
        }
    }

    Write-Warn "Backend did not respond within 120 seconds."
    Write-Warn "Check logs with:  cd $INSTALL_DIR  then  docker compose logs -f backend"
}

# -- Print summary -------------------------------------------------------------
function Print-Summary {
    $dashUrl = "http://localhost:3000"
    $envFile = "$INSTALL_DIR\.env"
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match "^DASHBOARD_URL=" } | Select-Object -First 1
        if ($line) { $dashUrl = $line -replace "^DASHBOARD_URL=", "" }
    }
    if (-not $dashUrl) { $dashUrl = "http://localhost:3000" }

    Write-Host ""
    Write-Host "  =============================================" -ForegroundColor Red
    Write-Host "       Breach Tower is running!               " -ForegroundColor Green
    Write-Host "  =============================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Dashboard :  http://localhost:3000" -ForegroundColor Cyan
    Write-Host "  API Docs  :  http://localhost:8000/docs" -ForegroundColor Cyan
    Write-Host "  Install   :  $INSTALL_DIR" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Useful commands:" -ForegroundColor White
    Write-Host "    cd $INSTALL_DIR" -ForegroundColor DarkGray
    Write-Host "    docker compose logs -f              # live logs" -ForegroundColor DarkGray
    Write-Host "    docker compose logs -f backend      # backend only" -ForegroundColor DarkGray
    Write-Host "    docker compose down                 # stop" -ForegroundColor DarkGray
    Write-Host "    docker compose up -d                # start" -ForegroundColor DarkGray
    Write-Host "    .\install.ps1 -Update               # update to latest" -ForegroundColor DarkGray
    Write-Host "    .\install.ps1 -Uninstall            # remove everything" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Next steps:" -ForegroundColor Yellow
    Write-Host "    1. Open the dashboard and register your admin account" -ForegroundColor DarkGray
    Write-Host "    2. Add your API keys in Settings > Intelligence Sources" -ForegroundColor DarkGray
    Write-Host "    3. Add your domains/emails in Targets" -ForegroundColor DarkGray
    Write-Host "    4. Run your first scan" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  GitHub: https://github.com/Rusheelraj/Breach-Tower" -ForegroundColor DarkGray
    Write-Host ""
}

# -- Uninstall -----------------------------------------------------------------
function Run-Uninstall {
    Require-Admin
    Write-Warn "This will stop all containers and delete $INSTALL_DIR (including your database)."
    $confirm = Read-Host "[?] Are you sure? Type 'yes' to confirm"
    if ($confirm -eq "yes") {
        if (Test-Path "$INSTALL_DIR\docker-compose.yml") {
            Push-Location $INSTALL_DIR
            docker compose down -v
            Pop-Location
        }
        Remove-Item -Path $INSTALL_DIR -Recurse -Force
        Write-Success "Breach Tower uninstalled."
    } else {
        Write-Info "Uninstall cancelled."
    }
    Pause-AndExit 0
}

# -- Update --------------------------------------------------------------------
function Run-Update {
    Require-Admin
    Print-Banner
    Write-Step "Updating Breach Tower"

    if (-not (Test-Path "$INSTALL_DIR\.git")) {
        Die "Breach Tower installation not found at $INSTALL_DIR. Run the installer without -Update first."
    }

    git -C $INSTALL_DIR reset --hard HEAD
    git -C $INSTALL_DIR clean -fd
    git -C $INSTALL_DIR pull --ff-only

    Ensure-SessionFile

    Assert-DockerRunning
    Assert-DockerCompose

    Push-Location $INSTALL_DIR
    docker compose up -d --build
    Pop-Location

    Wait-ForHealthy
    Write-Success "Breach Tower updated."
    Print-Summary
    Pause-AndExit 0
}

# -- Main ----------------------------------------------------------------------
function Main {
    if ($Uninstall) { Run-Uninstall }
    if ($Update)    { Run-Update }

    Print-Banner
    Require-Admin

    Write-Step "System Check"
    Ensure-Winget

    Write-Step "Installing Dependencies"
    Install-GitIfMissing
    Install-DockerIfMissing
    Assert-DockerRunning
    Assert-DockerCompose

    Write-Step "Cloning Repository"
    Clone-Or-Update-Repo

    Write-Step "Configuration"
    $freshEnv = Configure-Env

    Build-And-Start -FreshEnv $freshEnv
    Wait-ForHealthy
    Print-Summary
    Pause-AndExit 0
}

# Wrap the entire script in a try/catch so unhandled exceptions also pause
# before the window closes, instead of silently disappearing.
try {
    Main
} catch {
    Write-Host ""
    Write-Err "Unexpected error: $_"
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
    Write-Host ""
    Pause-AndExit 1
}
