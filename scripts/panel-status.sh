#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FCC_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=linux-systemd.sh
source "$SCRIPT_DIR/linux-systemd.sh"
SERVICE_NAME="factorio-control-center"
USER_UNIT="$HOME/.config/systemd/user/${SERVICE_NAME}.service"
SYSTEM_UNIT="/etc/systemd/system/${SERVICE_NAME}.service"

user_systemd_env

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

service_state() {
  local state=""
  if ! is_root && [[ -f "$USER_UNIT" ]]; then
    state="$(systemctl_user show -p ActiveState --value "$SERVICE_NAME" 2>/dev/null || true)"
    case "$state" in
      active) echo "Running (user)"; return 0 ;;
      activating) echo "Restarting (user)"; return 0 ;;
      failed) echo "Failed (user)"; return 0 ;;
    esac
    if systemctl_user is-enabled "$SERVICE_NAME" >/dev/null 2>&1; then
      echo "Stopped (user)"
      return 0
    fi
  fi
  if [[ -f "$SYSTEM_UNIT" ]]; then
    state="$(systemctl show -p ActiveState --value "$SERVICE_NAME" 2>/dev/null || true)"
    case "$state" in
      active) echo "Running (system)"; return 0 ;;
      activating) echo "Restarting (system)"; return 0 ;;
      failed) echo "Failed (system)"; return 0 ;;
    esac
    if systemctl is-enabled "$SERVICE_NAME" >/dev/null 2>&1; then
      echo "Stopped (system)"
      return 0
    fi
  fi
  echo "Not installed"
}

nest_port=8080
if command -v node >/dev/null 2>&1; then
  nest_port="$(node "$FCC_DIR/scripts/read-bind-port.mjs" 2>/dev/null || echo 8080)"
fi

panel_state="Not running"
panel_detail=""
for port in "$nest_port" 80 443 8080 8443 5173; do
  if [[ -z "$panel_detail" ]]; then
    pid="$(port_listen_pid "$port")"
    if [[ -n "$pid" ]]; then
      panel_state="Running"
      panel_detail="port ${port}, PID ${pid}"
    fi
  fi
done

app_version="$(node "$FCC_DIR/scripts/read-app-version.mjs" 2>/dev/null || echo '?')"
if [[ "$nest_port" == "80" ]]; then
  panel_url="http://127.0.0.1/"
elif [[ "$nest_port" == "443" ]]; then
  panel_url="https://127.0.0.1/"
else
  panel_url="http://127.0.0.1:${nest_port}/"
fi

echo
echo "Factorio Control Center - status"
echo "--------------------------------"
echo "Version: ${app_version}"
echo "Panel:   ${panel_state}"
if [[ -n "$panel_detail" ]]; then
  echo "         ${panel_detail}"
fi
echo "Service: $(service_state)"
echo "URL:     ${panel_url}"
echo
