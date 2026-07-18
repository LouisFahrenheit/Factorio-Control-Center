#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FCC_DIR="$SCRIPT_DIR"
FCC_ROOT_DIR="$FCC_DIR"
# shellcheck source=scripts/linux-systemd.sh
source "$FCC_DIR/scripts/linux-systemd.sh"
NEST_PORT=8080
PANEL_URL=""
FCC_RELEASE=0

load_bind_port() {
  export FCC_ROOT_DIR="$FCC_DIR"
  export FCC_SETTINGS_PATH="$FCC_DIR/fcc-settings.ini"
  if command -v node >/dev/null 2>&1; then
    NEST_PORT="$(node "$FCC_DIR/scripts/read-bind-port.mjs" 2>/dev/null || echo 8080)"
  fi
  if [[ "$NEST_PORT" == "80" ]]; then
    PANEL_URL="http://127.0.0.1/"
  elif [[ "$NEST_PORT" == "443" ]]; then
    PANEL_URL="https://127.0.0.1/"
  else
    PANEL_URL="http://127.0.0.1:${NEST_PORT}/"
  fi
}

port_listen_pid() {
  local port="$1"
  local pid=""
  if command -v lsof >/dev/null 2>&1; then
    pid="$(lsof -ti ":${port}" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  elif command -v ss >/dev/null 2>&1; then
    pid="$(ss -tlnp 2>/dev/null | awk -v p=":${port}\$" '
      $1 == "LISTEN" && $4 ~ p {
        if (match($0, /pid=([0-9]+)/, m)) { print m[1]; exit }
      }')"
  elif command -v fuser >/dev/null 2>&1; then
    pid="$(fuser -n tcp "${port}" 2>/dev/null | tr -s ' ' '\n' | head -n 1 || true)"
  fi
  printf '%s' "$pid"
}

ensure_port_free() {
  local pid
  pid="$(port_listen_pid "$NEST_PORT")"
  if [[ -n "$pid" ]]; then
    echo "Panel already on port ${NEST_PORT} (PID ${pid}). Use option 2 to stop first."
    read -r -p "Press Enter..."
    return 1
  fi
  return 0
}

detect_release() {
  FCC_RELEASE=0
  if [[ -f "$FCC_DIR/client/dist/index.html" && ! -f "$FCC_DIR/client/package.json" ]]; then
    FCC_RELEASE=1
  fi
}

ensure_deps() {
  if [[ -d "$FCC_DIR/node_modules" ]]; then
    return 0
  fi
  echo "Installing dependencies..."
  if [[ "$FCC_RELEASE" -eq 1 ]]; then
    npm ci --omit=dev
  else
    npm install
  fi
}

start_panel() {
  ensure_port_free || return

  if [[ "$FCC_RELEASE" -ne 1 && ! -f "$FCC_DIR/dist/main.js" ]]; then
    echo
    echo "Build not found. Use ./StartDEV.sh to build from source, or install a release archive."
    read -r -p "Press Enter..."
    return
  fi

  if [[ ! -f "$FCC_DIR/dist/main.js" || ! -f "$FCC_DIR/client/dist/index.html" ]]; then
    echo "ERROR: Release build incomplete."
    read -r -p "Press Enter..."
    return
  fi

  local app_version
  app_version="$(node "$FCC_DIR/scripts/read-app-version.mjs" 2>/dev/null || echo '?')"
  echo
  echo "Starting panel v${app_version}..."
  echo "Open: ${PANEL_URL}"
  (
    cd "$FCC_DIR"
    export FCC_ROOT_DIR="$FCC_ROOT_DIR"
    exec node dist/main.js
  ) &
  sleep 3
  read -r -p "Press Enter..."
}

if [[ ! -f "$FCC_DIR/package.json" ]]; then
  echo "ERROR: package.json not found at $FCC_DIR"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js not found. Install from https://nodejs.org/"
  exit 1
fi

ensure_linux_executables "$FCC_DIR"

cd "$FCC_DIR"
detect_release
ensure_deps

while true; do
  load_bind_port
  clear
  echo
  echo " Factorio Control Center"
  echo " -----------------------"
  echo " Panel: ${PANEL_URL}"
  echo
  echo "  1. Start panel"
  echo "  2. Stop panel"
  echo "  3. Install service"
  echo "  4. Remove service"
  echo "  5. Start service"
  echo "  6. Stop service"
  echo "  7. Update panel"
  echo "  8. Show panel log"
  echo "  9. Status"
  echo " 10. Exit"
  echo
  read -r -p "Choose [1-10]: " ACTION

  case "$ACTION" in
    1) start_panel ;;
    2)
      echo
      bash "$FCC_DIR/scripts/stop-panel.sh"
      read -r -p "Press Enter..."
      ;;
    3)
      echo
      bash "$FCC_DIR/scripts/install-service.sh" install --default
      read -r -p "Press Enter..."
      ;;
    4)
      echo
      bash "$FCC_DIR/scripts/install-service.sh" remove --auto
      read -r -p "Press Enter..."
      ;;
    5)
      echo
      bash "$FCC_DIR/scripts/install-service.sh" start --auto
      read -r -p "Press Enter..."
      ;;
    6)
      echo
      bash "$FCC_DIR/scripts/install-service.sh" stop --auto
      read -r -p "Press Enter..."
      ;;
    7)
      echo
      bash "$FCC_DIR/scripts/update-panel.sh"
      read -r -p "Press Enter..."
      ;;
    8) bash "$FCC_DIR/scripts/show-logs.sh" ;;
    9)
      bash "$FCC_DIR/scripts/panel-status.sh"
      read -r -p "Press Enter..."
      ;;
    10) exit 0 ;;
    *) ;;
  esac
done
