#!/usr/bin/env bash
# Install, remove, start, or stop the Factorio Control Center systemd service.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FCC_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=linux-systemd.sh
source "$SCRIPT_DIR/linux-systemd.sh"

RUN_SCRIPT="$SCRIPT_DIR/run-prod-service.sh"
SERVICE_NAME="factorio-control-center"
USER_UNIT="$HOME/.config/systemd/user/${SERVICE_NAME}.service"
SYSTEM_UNIT="/etc/systemd/system/${SERVICE_NAME}.service"

usage() {
  cat <<'EOF'
Factorio Control Center - systemd service

Usage:
  ./scripts/install-service.sh install [--user | --system | --default]
  ./scripts/install-service.sh remove [--user | --system | --auto]
  ./scripts/install-service.sh start  [--user | --system | --auto]
  ./scripts/install-service.sh stop   [--user | --system | --auto]
  ./scripts/install-service.sh status [--user | --system | --auto]

  --default Pick user service for normal users, system service when run as root
  --user    Per-user service (not available as root)
  --system  System-wide service
  --auto    Use whichever service unit is already installed

After install (--user), enable lingering so the panel starts at boot without login:
  sudo loginctl enable-linger $USER
EOF
}

require_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: Node.js not found. Install Node.js 24+ from https://nodejs.org/"
    exit 1
  fi
}

require_build() {
  if [[ ! -f "$FCC_DIR/dist/main.js" ]]; then
    echo "ERROR: dist/main.js not found."
    echo "Build first (npm run build:all) or use a release archive."
    exit 1
  fi
}

detect_scope() {
  if ! is_root && [[ -f "$USER_UNIT" ]]; then
    echo user
    return 0
  fi
  if [[ -f "$USER_UNIT" ]]; then
    echo user
    return 0
  fi
  if [[ -f "$SYSTEM_UNIT" ]]; then
    echo system
    return 0
  fi
  echo none
}

write_unit() {
  local dest="$1"
  local run_script="$2"
  local wanted_by="$3"
  ensure_linux_executables "$FCC_DIR"
  chmod +x "$run_script" 2>/dev/null || true
  mkdir -p "$(dirname "$dest")"
  cat >"$dest" <<EOF
[Unit]
Description=Factorio Control Center
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${FCC_DIR}
Environment=FCC_ROOT_DIR=${FCC_DIR}
ExecStart=${run_script}
Restart=on-failure
RestartSec=10

[Install]
WantedBy=${wanted_by}
EOF
}

install_user() {
  if is_root; then
    echo "ERROR: systemctl --user does not work when running as root."
    echo "Install again with: ./scripts/install-service.sh install --system"
    exit 1
  fi
  write_unit "$USER_UNIT" "$RUN_SCRIPT" "default.target"
  systemctl_user daemon-reload
  systemctl_user enable --now "$SERVICE_NAME"
  echo
  echo "User service installed and started."
  echo "  status: systemctl --user status $SERVICE_NAME"
  echo "  logs:   journalctl --user -u $SERVICE_NAME -f  (or Start.sh option 8)"
  echo
  echo "To start at boot without logging in:"
  echo "  sudo loginctl enable-linger $USER"
}

install_system() {
  write_unit "$SYSTEM_UNIT" "$RUN_SCRIPT" "multi-user.target"
  systemctl_system daemon-reload
  systemctl_system enable --now "$SERVICE_NAME"
  echo
  echo "System service installed and started."
  if is_root; then
    echo "  status: systemctl status $SERVICE_NAME"
  else
    echo "  status: sudo systemctl status $SERVICE_NAME"
  fi
  echo "  logs:   journalctl -u $SERVICE_NAME -f  (or Start.sh option 8)"
}

remove_user() {
  if is_root; then
    echo "ERROR: No user service to remove while running as root."
    exit 1
  fi
  systemctl_user disable --now "$SERVICE_NAME" 2>/dev/null || true
  rm -f "$USER_UNIT"
  systemctl_user daemon-reload
  echo "User service removed."
}

remove_system() {
  systemctl_system disable --now "$SERVICE_NAME" 2>/dev/null || true
  if is_root; then
    rm -f "$SYSTEM_UNIT"
  else
    sudo rm -f "$SYSTEM_UNIT"
  fi
  systemctl_system daemon-reload
  echo "System service removed."
}

start_user() {
  if [[ ! -f "$USER_UNIT" ]]; then
    echo "ERROR: Service is not installed. Run install first."
    exit 1
  fi
  if is_root; then
    echo "ERROR: User service cannot be started as root."
    exit 1
  fi
  ensure_linux_executables "$FCC_DIR"
  systemctl_user start "$SERVICE_NAME"
  echo "Service started."
}

stop_user() {
  if [[ ! -f "$USER_UNIT" ]]; then
    echo "ERROR: Service is not installed. Run install first."
    exit 1
  fi
  if is_root; then
    echo "ERROR: User service cannot be stopped as root."
    exit 1
  fi
  if systemctl_user is-active "$SERVICE_NAME" >/dev/null 2>&1; then
    systemctl_user stop "$SERVICE_NAME"
    echo "Service stopped."
  else
    echo "Service is not running."
  fi
}

start_system() {
  if [[ ! -f "$SYSTEM_UNIT" ]]; then
    echo "ERROR: Service is not installed. Run install first."
    exit 1
  fi
  ensure_linux_executables "$FCC_DIR"
  systemctl_system start "$SERVICE_NAME"
  echo "Service started."
}

stop_system() {
  if [[ ! -f "$SYSTEM_UNIT" ]]; then
    echo "ERROR: Service is not installed. Run install first."
    exit 1
  fi
  if systemctl is-active "$SERVICE_NAME" >/dev/null 2>&1; then
    systemctl_system stop "$SERVICE_NAME"
    echo "Service stopped."
  else
    echo "Service is not running."
  fi
}

status_user() {
  if [[ ! -f "$USER_UNIT" ]]; then
    echo "Service is not installed."
    return 0
  fi
  if is_root; then
    echo "User service unit exists but cannot be queried as root."
    return 0
  fi
  systemctl_user status "$SERVICE_NAME" --no-pager || true
}

status_system() {
  if [[ ! -f "$SYSTEM_UNIT" ]]; then
    echo "Service is not installed."
    return 0
  fi
  systemctl_system status "$SERVICE_NAME" --no-pager || true
}

ACTION="${1:-}"
SCOPE="${2:---default}"

case "$ACTION" in
  install|remove|start|stop|status) ;;
  -h|--help|help|"") usage; exit 0 ;;
  *) echo "Unknown action: $ACTION"; usage; exit 1 ;;
esac

if [[ "$SCOPE" == "--auto" ]]; then
  detected="$(detect_scope)"
  if [[ "$detected" == "none" ]]; then
    if [[ "$ACTION" == "remove" ]]; then
      echo "Service is not installed."
      exit 0
    fi
    echo "ERROR: Service is not installed."
    exit 1
  fi
  MODE="$detected"
elif [[ "$SCOPE" == "--default" ]]; then
  if [[ "$ACTION" == "install" ]]; then
    service_scope_hint
    MODE="$(default_service_scope)"
  else
    detected="$(detect_scope)"
    if [[ "$detected" == "none" ]]; then
      MODE="$(default_service_scope)"
    else
      MODE="$detected"
    fi
  fi
else
  case "$SCOPE" in
    --user) MODE=user ;;
    --system) MODE=system ;;
    *) echo "Unknown scope: $SCOPE"; usage; exit 1 ;;
  esac
fi

require_node
case "$ACTION" in
  install|remove) require_build ;;
esac

case "$ACTION-$MODE" in
  install-user) install_user ;;
  install-system) install_system ;;
  remove-user) remove_user ;;
  remove-system) remove_system ;;
  start-user) start_user ;;
  start-system) start_system ;;
  stop-user) stop_user ;;
  stop-system) stop_system ;;
  status-user) status_user ;;
  status-system) status_system ;;
esac
