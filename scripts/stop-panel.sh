#!/usr/bin/env bash
# Stop panel process and optional systemd user service.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FCC_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=linux-systemd.sh
source "$SCRIPT_DIR/linux-systemd.sh"

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

stopped=0
SERVICE_NAME="factorio-control-center"

if ! is_root && [[ -f "$HOME/.config/systemd/user/${SERVICE_NAME}.service" ]]; then
  state="$(systemctl_user show -p ActiveState --value "$SERVICE_NAME" 2>/dev/null || true)"
  if [[ "$state" == "active" || "$state" == "activating" ]]; then
    echo "Stopping systemd user service..."
    systemctl_user stop "$SERVICE_NAME" || true
    stopped=1
  fi
fi

if [[ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]]; then
  state="$(systemctl show -p ActiveState --value "$SERVICE_NAME" 2>/dev/null || true)"
  if [[ "$state" == "active" || "$state" == "activating" ]]; then
    echo "Stopping systemd system service..."
    systemctl_system stop "$SERVICE_NAME" || true
    stopped=1
  fi
fi

nest_port=8080
if command -v node >/dev/null 2>&1; then
  nest_port="$(node "$FCC_DIR/scripts/read-bind-port.mjs" 2>/dev/null || echo 8080)"
fi

for port in "$nest_port" 80 443 8080 8443 5173; do
  pid="$(port_listen_pid "$port")"
  if [[ -n "$pid" ]]; then
    echo "Stopping port ${port} (PID ${pid})..."
    kill -TERM "$pid" 2>/dev/null || true
    sleep 1
    kill -KILL "$pid" 2>/dev/null || true
    stopped=1
  fi
done

if [[ "$stopped" -eq 1 ]]; then
  echo "Done."
else
  echo "Panel is not running."
fi
