#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FCC_DIR="$SCRIPT_DIR"
FCC_ROOT_DIR="$FCC_DIR"
VITE_PORT=5173
VITE_URL="http://127.0.0.1:${VITE_PORT}/login"
NEST_PORT=8080
PANEL_URL=""
NEST_URL=""

load_bind_port() {
  export FCC_ROOT_DIR="$FCC_DIR"
  export FCC_SETTINGS_PATH="$FCC_DIR/fcc-settings.ini"
  if command -v node >/dev/null 2>&1; then
    NEST_PORT="$(node "$FCC_DIR/scripts/read-bind-port.mjs" 2>/dev/null || echo 8080)"
  fi
  if [[ "$NEST_PORT" == "80" ]]; then
    PANEL_URL="http://127.0.0.1/"
    NEST_URL="http://127.0.0.1/"
  elif [[ "$NEST_PORT" == "443" ]]; then
    PANEL_URL="https://127.0.0.1/"
    NEST_URL="https://127.0.0.1/"
  else
    PANEL_URL="http://127.0.0.1:${NEST_PORT}/"
    NEST_URL="http://127.0.0.1:${NEST_PORT}/"
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
  local port="$1"
  local name="$2"
  local pid
  pid="$(port_listen_pid "$port")"
  if [[ -n "$pid" ]]; then
    echo "${name} already on port ${port} (PID ${pid}). Use option 6 to stop."
    read -r -p "Press Enter..."
    return 1
  fi
  return 0
}

open_url() {
  local url="$1"
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 &
  elif command -v sensible-browser >/dev/null 2>&1; then
    sensible-browser "$url" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 &
  else
    echo "Open in browser: $url"
  fi
}

run_dev() {
  if [[ -f "$FCC_DIR/client/dist/index.html" && ! -f "$FCC_DIR/client/package.json" ]]; then
    echo "Dev mode is not available in a release build."
    read -r -p "Press Enter..."
    return
  fi
  ensure_port_free "$NEST_PORT" "Nest" || return
  ensure_port_free "$VITE_PORT" "Vite" || return
  echo "Starting Nest..."
  (cd "$FCC_DIR" && export FCC_ROOT_DIR="$FCC_ROOT_DIR" && npm run start:dev) &
  sleep 8
  echo "Starting Vite..."
  (cd "$FCC_DIR" && npm run client:dev) &
  sleep 5
  echo "Dev: ${VITE_URL}  |  API: ${NEST_URL}"
  read -r -p "Press Enter..."
}

run_prod() {
  ensure_port_free "$NEST_PORT" "Nest" || return
  if [[ ! -f "$FCC_DIR/dist/main.js" || ! -f "$FCC_DIR/client/dist/index.html" ]]; then
    echo "Building..."
    if ! (cd "$FCC_DIR" && npm run build:all); then
      echo "Build failed."
      read -r -p "Press Enter..."
      return
    fi
  fi
  echo "Starting production..."
  (cd "$FCC_DIR" && export FCC_ROOT_DIR="$FCC_ROOT_DIR" && npm run start:prod) &
  sleep 6
  echo "Production: ${PANEL_URL}"
  read -r -p "Press Enter..."
}

if [[ ! -f "$FCC_DIR/package.json" ]]; then
  echo "ERROR: package.json not found"
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js not found"
  exit 1
fi

cd "$FCC_DIR"
if [[ ! -d "$FCC_DIR/node_modules" ]]; then
  echo "Installing backend dependencies..."
  npm install
fi
if [[ ! -d "$FCC_DIR/client/node_modules" ]]; then
  echo "Installing client dependencies..."
  (cd "$FCC_DIR/client" && npm install)
fi

while true; do
  load_bind_port
  clear
  echo
  echo " Factorio Control Center — DEV"
  echo " -----------------------------"
  echo " Dev UI:  ${VITE_URL}"
  echo " Prod UI: ${PANEL_URL}"
  echo
  echo " 1. Dev mode (Nest + Vite)"
  echo " 2. Production (build if needed)"
  echo " 3. Build all"
  echo " 4. Open dev UI"
  echo " 5. Open prod UI"
  echo " 6. Stop servers"
  echo " 7. Pack release"
  echo " 8. Exit"
  echo
  read -r -p "Choose [1-8]: " ACTION

  case "$ACTION" in
    1) run_dev ;;
    2) run_prod ;;
    3) (cd "$FCC_DIR" && npm run build:all); read -r -p "Press Enter..." ;;
    4) open_url "$VITE_URL" ;;
    5) open_url "$PANEL_URL" ;;
    6) bash "$FCC_DIR/scripts/stop-panel.sh"; read -r -p "Press Enter..." ;;
    7) (cd "$FCC_DIR" && npm run pack:release); read -r -p "Press Enter..." ;;
    8) exit 0 ;;
    *) ;;
  esac
done
