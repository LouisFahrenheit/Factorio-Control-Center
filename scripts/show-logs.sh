#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FCC_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=linux-systemd.sh
source "$SCRIPT_DIR/linux-systemd.sh"

user_systemd_env

SERVICE_NAME="factorio-control-center"
USER_UNIT="$HOME/.config/systemd/user/${SERVICE_NAME}.service"
SYSTEM_UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
LOG_FILE="$FCC_DIR/logs/web_panel.log"

follow_journal_system() {
  echo
  echo "=== journalctl -u ${SERVICE_NAME} -f ==="
  echo "Press Ctrl+C to return to the menu."
  echo
  if is_root; then
    journalctl -u "$SERVICE_NAME" -f --no-pager
  else
    sudo journalctl -u "$SERVICE_NAME" -f --no-pager
  fi
}

follow_journal_user() {
  echo
  echo "=== journalctl --user -u ${SERVICE_NAME} -f ==="
  echo "Press Ctrl+C to return to the menu."
  echo
  journalctl --user -u "$SERVICE_NAME" -f --no-pager
}

show_file_log() {
  echo
  echo "=== web_panel.log ==="
  echo
  if command -v node >/dev/null 2>&1; then
    node "$SCRIPT_DIR/read-panel-log.mjs" "$LOG_FILE"
  else
    cat "$LOG_FILE"
  fi
  echo
  read -r -p "Press Enter..."
}

if [[ -f "$USER_UNIT" ]] && ! is_root; then
  follow_journal_user
  exit 0
fi

if [[ -f "$SYSTEM_UNIT" ]]; then
  follow_journal_system
  exit 0
fi

if [[ -f "$LOG_FILE" ]]; then
  show_file_log
  exit 0
fi

echo
echo "No service log and no web_panel.log found."
echo "Start the panel (option 1) or install the service (option 3)."
read -r -p "Press Enter..."
exit 1
