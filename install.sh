#!/usr/bin/env bash
# =============================================================================
#  Breach Tower -- One-liner Installer for Linux
#  Usage: sudo bash install.sh
# =============================================================================

set -euo pipefail

# -- Colours ------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
DIM='\033[2m'
RESET='\033[0m'
BOLD='\033[1m'

# -- Helpers ------------------------------------------------------------------
info()    { echo -e "${CYAN}${BOLD}[*]${RESET} $*"; }
success() { echo -e "${GREEN}${BOLD}[+]${RESET} $*"; }
warn()    { echo -e "${YELLOW}${BOLD}[!]${RESET} $*"; }
error()   { echo -e "${RED}${BOLD}[-]${RESET} $*" >&2; }
step()    { echo -e "\n${WHITE}${BOLD}>>> $* <<<${RESET}\n"; }
ask()     { echo -ne "${CYAN}${BOLD}[?]${RESET} $* "; }

die() {
  error "$*"
  exit 1
}

require_root() {
  if [[ $EUID -ne 0 ]]; then
    die "This installer must be run as root. Re-run with: sudo bash install.sh"
  fi
}

# -- Banner -------------------------------------------------------------------
print_banner() {
  echo -e "${RED}"
  cat <<'EOF'
  ██████╗ ██████╗ ███████╗ █████╗  ██████╗██╗  ██╗
  ██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔════╝██║  ██║
  ██████╔╝██████╔╝█████╗  ███████║██║     ███████║
  ██╔══██╗██╔══██╗██╔══╝  ██╔══██║██║     ██╔══██║
  ██████╔╝██║  ██║███████╗██║  ██║╚██████╗██║  ██║
  ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝

  ████████╗ ██████╗ ██╗    ██╗███████╗██████╗
  ╚══██╔══╝██╔═══██╗██║    ██║██╔════╝██╔══██╗
     ██║   ██║   ██║██║ █╗ ██║█████╗  ██████╔╝
     ██║   ██║   ██║██║███╗██║██╔══╝  ██╔══██╗
     ██║   ╚██████╔╝╚███╔███╔╝███████╗██║  ██║
     ╚═╝    ╚═════╝  ╚══╝╚══╝ ╚══════╝╚═╝  ╚═╝
EOF
  echo -e "${RESET}"
  echo -e "${DIM}  Self-hosted dark web threat intelligence platform${RESET}"
  echo -e "${DIM}  https://github.com/Rusheelraj/Breach-Tower${RESET}"
  echo ""
}

# -- OS Detection -------------------------------------------------------------
detect_os() {
  if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    OS=$ID
    OS_VERSION=${VERSION_ID:-"unknown"}
  else
    die "Cannot detect OS. Only Linux is supported."
  fi

  case "$OS" in
    ubuntu|debian|linuxmint|pop|kali|parrot|raspbian)  PKG_MANAGER="apt" ;;
    centos|rhel|rocky|almalinux)                        PKG_MANAGER="yum" ;;
    fedora)                                             PKG_MANAGER="dnf" ;;
    arch|manjaro)                                       PKG_MANAGER="pacman" ;;
    *)
      warn "Unrecognised distro: $OS. Attempting apt-based install..."
      PKG_MANAGER="apt"
      ;;
  esac

  # For Docker repo, Kali/Parrot use Debian's package repo
  case "$OS" in
    kali|parrot)  DOCKER_OS="debian" ;;
    *)            DOCKER_OS="$OS" ;;
  esac

  success "Detected OS: ${BOLD}$OS $OS_VERSION${RESET} (package manager: $PKG_MANAGER)"
}

# -- Package helpers ----------------------------------------------------------
pkg_install() {
  case "$PKG_MANAGER" in
    apt)    apt-get install -y -q "$@" ;;
    yum)    yum install -y -q "$@" ;;
    dnf)    dnf install -y -q "$@" ;;
    pacman) pacman -S --noconfirm --quiet "$@" ;;
  esac
}

pkg_update() {
  case "$PKG_MANAGER" in
    apt)    apt-get update -q ;;
    yum)    yum makecache -q ;;
    dnf)    dnf makecache -q ;;
    pacman) pacman -Sy --noconfirm ;;
  esac
}

# -- Dependency checks --------------------------------------------------------
check_install_git() {
  if command -v git &>/dev/null; then
    success "Git already installed: $(git --version)"
  else
    info "Installing Git..."
    pkg_install git
    success "Git installed."
  fi
}

check_install_curl() {
  if command -v curl &>/dev/null; then
    success "curl already installed."
  else
    info "Installing curl..."
    pkg_install curl
    success "curl installed."
  fi
}

check_install_docker() {
  if command -v docker &>/dev/null; then
    DOCKER_VER=$(docker --version | awk '{print $3}' | tr -d ',')
    success "Docker already installed: v${DOCKER_VER}"
  else
    info "Installing Docker Engine..."

    case "$PKG_MANAGER" in
      apt)
        pkg_install ca-certificates gnupg lsb-release
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL "https://download.docker.com/linux/${DOCKER_OS}/gpg" \
          | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        chmod a+r /etc/apt/keyrings/docker.gpg

        # Kali/Parrot don't have a real VERSION_CODENAME in lsb_release
        # Use the upstream Debian codename instead
        local CODENAME
        if [[ "$OS" == "kali" || "$OS" == "parrot" ]]; then
          CODENAME="bookworm"
        else
          CODENAME=$(lsb_release -cs)
        fi

        echo \
          "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
          https://download.docker.com/linux/${DOCKER_OS} \
          ${CODENAME} stable" \
          | tee /etc/apt/sources.list.d/docker.list > /dev/null
        apt-get update -q
        pkg_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        ;;
      yum|dnf)
        pkg_install yum-utils
        yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
        pkg_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        ;;
      pacman)
        pkg_install docker docker-compose
        ;;
    esac

    systemctl enable --now docker
    success "Docker installed and started."
  fi

  # Ensure Docker daemon is running
  if ! systemctl is-active --quiet docker; then
    info "Starting Docker daemon..."
    systemctl start docker
  fi
}

check_install_docker_compose() {
  # Check if Docker Compose v2 plugin is available (preferred)
  if docker compose version 2>/dev/null | grep -qi "compose"; then
    local ver
    ver=$(docker compose version --short 2>/dev/null || docker compose version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    success "Docker Compose v2 already installed: $ver"
    return
  fi

  # Check if legacy docker-compose exists
  if command -v docker-compose &>/dev/null; then
    local old_ver major
    old_ver=$(docker-compose --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    major=$(echo "$old_ver" | cut -d. -f1)
    if [[ "$major" -ge 2 ]]; then
      success "docker-compose v2 already installed: $old_ver"
      return
    fi
    warn "docker-compose v${old_ver} is too old (v1.x). Upgrading to v2..."
  fi

  info "Installing Docker Compose v2..."

  # Try installing via Docker's apt plugin first
  if [[ "$PKG_MANAGER" == "apt" ]]; then
    if apt-get install -y -q docker-compose-plugin 2>/dev/null; then
      success "Docker Compose v2 plugin installed via apt."
      return
    fi
  fi

  # Fallback: download standalone v2 binary from GitHub
  info "Downloading Docker Compose v2 binary..."
  local COMPOSE_VERSION
  COMPOSE_VERSION=$(curl -fsSL https://api.github.com/repos/docker/compose/releases/latest \
    | grep '"tag_name"' | sed -E 's/.*"v?([^"]+)".*/\1/' | head -1)
  COMPOSE_VERSION=${COMPOSE_VERSION:-2.27.1}

  local ARCH
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64)  ARCH="x86_64" ;;
    aarch64) ARCH="aarch64" ;;
    armv7l)  ARCH="armv7" ;;
  esac

  curl -fsSL \
    "https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/docker-compose-linux-${ARCH}" \
    -o /usr/local/bin/docker-compose-v2
  chmod +x /usr/local/bin/docker-compose-v2

  if [[ -f /usr/local/bin/docker-compose ]]; then
    mv /usr/local/bin/docker-compose /usr/local/bin/docker-compose-v1-backup
  fi
  ln -sf /usr/local/bin/docker-compose-v2 /usr/local/bin/docker-compose

  success "Docker Compose v2 installed: $COMPOSE_VERSION"
}

# -- Add user to docker group -------------------------------------------------
add_user_to_docker_group() {
  if [[ -n "${SUDO_USER:-}" ]]; then
    if ! groups "$SUDO_USER" | grep -q docker; then
      info "Adding $SUDO_USER to docker group..."
      usermod -aG docker "$SUDO_USER"
      warn "Docker group added. Changes take effect on next login (or run: newgrp docker)."
    fi
  fi
}

# -- Clone / update repo ------------------------------------------------------
INSTALL_DIR="/opt/breach-tower"
REPO_URL="https://github.com/Rusheelraj/Breach-Tower.git"

clone_or_update_repo() {
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "Breach Tower already cloned. Pulling latest changes..."
    git -C "$INSTALL_DIR" reset --hard HEAD
    git -C "$INSTALL_DIR" clean -fd
    git -C "$INSTALL_DIR" pull --ff-only
    success "Repository updated."
  else
    info "Cloning Breach Tower into ${INSTALL_DIR}..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    success "Repository cloned."
  fi
}

# -- Generate secrets ---------------------------------------------------------
generate_secret() {
  python3 -c "import secrets; print(secrets.token_hex(64))" 2>/dev/null \
    || openssl rand -hex 64
}

generate_password() {
  python3 -c "import secrets, string; \
    chars = string.ascii_letters + string.digits; \
    print(''.join(secrets.choice(chars) for _ in range(24)))" 2>/dev/null \
    || openssl rand -base64 18 | tr -dc 'a-zA-Z0-9' | head -c 24
}

# -- Interactive .env setup ---------------------------------------------------
configure_env() {
  ENV_FILE="$INSTALL_DIR/.env"

  if [[ -f "$ENV_FILE" ]]; then
    warn ".env already exists at $INSTALL_DIR/.env"
    ask "Overwrite it? (y/N):"
    read -r overwrite
    [[ "$overwrite" =~ ^[Yy]$ ]] || { info "Keeping existing .env."; return; }
  fi

  echo ""
  info "Generating secure secrets automatically..."
  DB_PASSWORD=$(generate_password)
  JWT_SECRET=$(generate_secret)
  VAULT_PASSWORD=$(generate_password)
  success "Secrets generated."

  echo ""
  step "Configuration"
  info "Press Enter to skip optional fields -- configure them later in Settings."
  echo ""

  ask "Admin alert email (where breach alerts are sent):"
  read -r ALERT_EMAIL

  ask "SMTP host (e.g. smtp.gmail.com) [optional, press Enter to skip]:"
  read -r SMTP_HOST
  SMTP_HOST=${SMTP_HOST:-}

  ask "SMTP port [587]:"
  read -r SMTP_PORT
  SMTP_PORT=${SMTP_PORT:-587}

  ask "SMTP username / email [optional]:"
  read -r SMTP_USER

  ask "SMTP password / app password [optional]:"
  read -r -s SMTP_PASS
  echo ""

  ask "Slack webhook URL [optional]:"
  read -r SLACK_WEBHOOK

  ask "Dashboard public URL (e.g. https://yourdomain.com) [http://localhost:3000]:"
  read -r DASHBOARD_URL
  DASHBOARD_URL=${DASHBOARD_URL:-http://localhost:3000}

  cat > "$ENV_FILE" <<EOF
# =============================================================================
# Breach Tower -- Auto-generated by installer on $(date '+%Y-%m-%d %H:%M:%S')
# =============================================================================

# -- Database -----------------------------------------------------------------
DB_PASSWORD=${DB_PASSWORD}
DATABASE_URL=postgresql://admin:${DB_PASSWORD}@postgres:5432/breachtower

# -- Auth ---------------------------------------------------------------------
JWT_SECRET=${JWT_SECRET}
VAULT_PASSWORD=${VAULT_PASSWORD}

# -- SMTP ---------------------------------------------------------------------
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
ALERT_EMAIL=${ALERT_EMAIL}

# -- Slack --------------------------------------------------------------------
SLACK_WEBHOOK=${SLACK_WEBHOOK}

# -- Dashboard ----------------------------------------------------------------
DASHBOARD_URL=${DASHBOARD_URL}
ALLOWED_ORIGINS=${DASHBOARD_URL}

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
EOF

  chmod 600 "$ENV_FILE"
  ENV_FRESHLY_WRITTEN=1
  success ".env created at $ENV_FILE"
}

# -- Build and start ----------------------------------------------------------
COMPOSE_CMD=""
ENV_FRESHLY_WRITTEN=0

get_compose_cmd() {
  if docker compose version 2>/dev/null | grep -qi "compose"; then
    COMPOSE_CMD="docker compose"
  elif command -v docker-compose &>/dev/null; then
    local ver major
    ver=$(docker-compose --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    major=$(echo "$ver" | cut -d. -f1)
    if [[ "$major" -lt 2 ]]; then
      die "docker-compose v${ver} is too old (v1.x). Please re-run the installer to upgrade it."
    fi
    COMPOSE_CMD="docker-compose"
  else
    die "Docker Compose not found. Please re-run the installer."
  fi
  info "Using compose command: ${BOLD}$COMPOSE_CMD${RESET}"
}

build_and_start() {
  step "Building and Starting Breach Tower"
  cd "$INSTALL_DIR"

  # Check if any containers from this project are already running
  local running
  running=$($COMPOSE_CMD ps --services --filter status=running 2>/dev/null || true)

  if [[ -n "$running" ]]; then
    info "Stopping existing containers..."
    if [[ "${ENV_FRESHLY_WRITTEN:-0}" == "1" ]]; then
      warn "New .env detected — wiping old database volume to avoid password mismatch..."
      $COMPOSE_CMD down -v
    else
      $COMPOSE_CMD down
    fi
  elif [[ "${ENV_FRESHLY_WRITTEN:-0}" == "1" ]]; then
    # Containers not running but fresh .env written — wipe volume anyway
    # to avoid stale pgdata with wrong password from a previous run
    info "Removing any stale database volume..."
    $COMPOSE_CMD down -v 2>/dev/null || true
  fi

  # Ensure the Telegram session file exists as a file (not a directory).
  # Docker will create it as a directory if absent — that breaks Telethon.
  if [[ ! -f "$INSTALL_DIR/breachtower_session.session" ]]; then
    touch "$INSTALL_DIR/breachtower_session.session"
    info "Created empty Telegram session placeholder (authenticate via Settings after install)."
  fi

  info "Building Docker images (this may take a few minutes on first run)..."
  $COMPOSE_CMD build --no-cache

  info "Starting all services..."
  $COMPOSE_CMD up -d

  success "All services started."
}

# -- Wait for backend to be healthy -------------------------------------------
wait_for_healthy() {
  info "Waiting for services to become healthy..."
  local retries=40
  local count=0

  while [[ $count -lt $retries ]]; do
    if curl -sf http://localhost:8000/api/health > /dev/null 2>&1; then
      success "Backend is up and healthy."
      break
    fi
    sleep 3
    ((count++))
    if (( count % 5 == 0 )); then
      info "Still waiting... (${count}/${retries})"
    fi
  done

  if [[ $count -eq $retries ]]; then
    warn "Backend did not respond within 120 seconds."
    warn "Check logs with: cd $INSTALL_DIR && $COMPOSE_CMD logs -f backend"
  fi
}

# -- Print summary ------------------------------------------------------------
print_summary() {
  local DASH_URL
  DASH_URL=$(grep "^DASHBOARD_URL=" "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "http://localhost:3000")
  DASH_URL=${DASH_URL:-http://localhost:3000}

  echo ""
  echo -e "${RED}${BOLD}  =============================================${RESET}"
  echo -e "${GREEN}${BOLD}       Breach Tower is running!              ${RESET}"
  echo -e "${RED}${BOLD}  =============================================${RESET}"
  echo ""
  echo -e "  ${BOLD}Dashboard :${RESET}  ${CYAN}http://localhost:3000${RESET}"
  echo -e "  ${BOLD}API Docs  :${RESET}  ${CYAN}http://localhost:8000/docs${RESET}"
  echo -e "  ${BOLD}Install   :${RESET}  ${DIM}$INSTALL_DIR${RESET}"
  echo ""
  echo -e "  ${BOLD}Useful commands:${RESET}"
  echo -e "  ${DIM}  cd $INSTALL_DIR${RESET}"
  echo -e "  ${DIM}  $COMPOSE_CMD logs -f              # live logs${RESET}"
  echo -e "  ${DIM}  $COMPOSE_CMD logs -f backend      # backend only${RESET}"
  echo -e "  ${DIM}  $COMPOSE_CMD down                 # stop${RESET}"
  echo -e "  ${DIM}  $COMPOSE_CMD up -d                # start${RESET}"
  echo -e "  ${DIM}  sudo bash install.sh --update     # update to latest${RESET}"
  echo -e "  ${DIM}  sudo bash install.sh --uninstall  # remove everything${RESET}"
  echo ""
  echo -e "  ${YELLOW}${BOLD}Next steps:${RESET}"
  echo -e "  ${DIM}  1. Open the dashboard and register your admin account${RESET}"
  echo -e "  ${DIM}  2. Add your API keys in Settings > Intelligence Sources${RESET}"
  echo -e "  ${DIM}  3. Add your domains/emails in Targets${RESET}"
  echo -e "  ${DIM}  4. Run your first scan${RESET}"
  echo ""
  echo -e "  ${DIM}  GitHub: https://github.com/Rusheelraj/Breach-Tower${RESET}"
  echo ""
}

# -- Uninstall ----------------------------------------------------------------
uninstall() {
  require_root
  get_compose_cmd
  warn "This will stop all containers and delete $INSTALL_DIR (including your database)."
  ask "Are you sure? Type 'yes' to confirm:"
  read -r confirm
  if [[ "$confirm" == "yes" ]]; then
    cd "$INSTALL_DIR" && $COMPOSE_CMD down -v
    rm -rf "$INSTALL_DIR"
    success "Breach Tower uninstalled."
  else
    info "Uninstall cancelled."
  fi
  exit 0
}

# -- Main ---------------------------------------------------------------------
main() {
  case "${1:-}" in
    --uninstall)
      uninstall
      ;;
    --update)
      require_root
      print_banner
      step "Updating Breach Tower"
      git -C "$INSTALL_DIR" reset --hard HEAD
      git -C "$INSTALL_DIR" clean -fd
      git -C "$INSTALL_DIR" pull --ff-only
      get_compose_cmd
      cd "$INSTALL_DIR" && $COMPOSE_CMD up -d --build
      wait_for_healthy
      success "Breach Tower updated."
      print_summary
      exit 0
      ;;
  esac

  print_banner
  require_root

  step "System Check"
  detect_os

  step "Installing Dependencies"
  pkg_update
  check_install_curl
  check_install_git
  check_install_docker
  check_install_docker_compose
  add_user_to_docker_group
  get_compose_cmd

  step "Cloning Repository"
  clone_or_update_repo

  step "Configuration"
  configure_env

  build_and_start
  wait_for_healthy
  print_summary
}

main "$@"
