#!/usr/bin/env bash
# Apply a release archive over the current install (keeps data/, logs/, fcc-settings.ini).
set -euo pipefail

RELEASE_URL="https://github.com/LouisFahrenheit/Factorio-Control-Center/releases/latest/download/factorio-control-center-linux.tar.gz"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FCC_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=linux-systemd.sh
source "$SCRIPT_DIR/linux-systemd.sh"
SERVICE_NAME="factorio-control-center"
USER_UNIT="$HOME/.config/systemd/user/${SERVICE_NAME}.service"
SYSTEM_UNIT="/etc/systemd/system/${SERVICE_NAME}.service"

CURRENT_VER="$(node "$SCRIPT_DIR/read-app-version.mjs" 2>/dev/null || echo '?')"

echo
echo "Factorio Control Center - update"
echo "Current version: $CURRENT_VER"
echo
echo "WARNING: The panel will be stopped. data/ and fcc-settings.ini are kept."
echo "         Back up data/ and fcc-settings.ini before continuing."
echo

ARCHIVE=""
ARCHIVE_SOURCE=""
UPDATE_PLAN=""

find_local_archive() {
  local dir candidate
  for dir in "$FCC_DIR" "$(dirname "$FCC_DIR")"; do
    candidate="$dir/factorio-control-center-linux.tar.gz"
    if [[ -f "$candidate" ]]; then
      ARCHIVE="$candidate"
      ARCHIVE_SOURCE="local"
      UPDATE_PLAN="Local archive"
      return 0
    fi
    shopt -s nullglob
    local files=("$dir"/factorio-control-center-*-linux.tar.gz)
    shopt -u nullglob
    if ((${#files[@]})); then
      ARCHIVE="$(ls -1t "${files[@]}" 2>/dev/null | head -n1)"
      ARCHIVE_SOURCE="local"
      UPDATE_PLAN="Local archive (legacy name)"
      return 0
    fi
  done
  return 1
}

if find_local_archive; then
  :
else
  UPDATE_PLAN="GitHub download"
  ARCHIVE_SOURCE="download"
  ARCHIVE="$RELEASE_URL"
fi

echo "Update source: $UPDATE_PLAN"
echo "  $ARCHIVE"
echo
read -r -p "Start update? [y/N]: " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Update cancelled."
  exit 0
fi
echo

bash "$SCRIPT_DIR/stop-panel.sh" || true

DOWNLOADED=0
if [[ "$ARCHIVE_SOURCE" == "download" ]]; then
  echo "Downloading from GitHub..."
  ARCHIVE="$(mktemp -t fcc-update-download.XXXXXX.tar.gz)"
  DOWNLOADED=1
  if ! curl -fsSL -o "$ARCHIVE" "$RELEASE_URL"; then
    rm -f "$ARCHIVE"
    echo "ERROR: Download failed: $RELEASE_URL"
    echo "Put factorio-control-center-linux.tar.gz next to the panel folder and retry."
    exit 1
  fi
fi

echo "Using archive:"
echo "  $ARCHIVE"
echo

STAGING="$(mktemp -d)"
cleanup() {
  rm -rf "$STAGING"
  if [[ "$DOWNLOADED" == "1" && -n "${ARCHIVE:-}" ]]; then
    rm -f "$ARCHIVE"
  fi
}
trap cleanup EXIT

echo "Extracting..."
case "$ARCHIVE" in
  *.tar.gz|*.tgz) tar -xzf "$ARCHIVE" -C "$STAGING" ;;
  *.zip)
    if command -v unzip >/dev/null 2>&1; then
      unzip -q "$ARCHIVE" -d "$STAGING"
    else
      tar -xf "$ARCHIVE" -C "$STAGING"
    fi
    ;;
  *) echo "ERROR: Unsupported archive type."; exit 1 ;;
esac

SRC=""
if [[ -f "$STAGING/dist/main.js" ]]; then
  SRC="$STAGING"
else
  for d in "$STAGING"/*; do
    if [[ -f "$d/dist/main.js" ]]; then
      SRC="$d"
      break
    fi
  done
fi

if [[ -z "$SRC" || ! -f "$SRC/dist/main.js" ]]; then
  echo "ERROR: Invalid release archive (dist/main.js not found)."
  exit 1
fi

echo "Updating $FCC_DIR ..."
shopt -s dotglob
for item in "$SRC"/*; do
  name="$(basename "$item")"
  case "$name" in
    data|logs|fcc-settings.ini) continue ;;
  esac
  rm -rf "$FCC_DIR/$name"
  cp -a "$item" "$FCC_DIR/$name"
done
shopt -u dotglob

ensure_linux_executables "$FCC_DIR"

echo "Installing dependencies..."
(cd "$FCC_DIR" && npm ci --omit=dev)

NEW_VER="$(node "$SCRIPT_DIR/read-app-version.mjs" 2>/dev/null || echo '?')"

echo
echo "Update complete: $CURRENT_VER -> $NEW_VER"

if [[ -f "$USER_UNIT" ]] && ! is_root; then
  echo "Starting user service..."
  systemctl_user start "$SERVICE_NAME" || {
    echo "Service start failed. Try ./Start.sh -> 5. Start service or 1. Start panel."
    exit 0
  }
elif [[ -f "$SYSTEM_UNIT" ]]; then
  echo "Starting system service..."
  systemctl_system start "$SERVICE_NAME" || {
    echo "Service start failed. Try ./Start.sh -> 5. Start service or 1. Start panel."
    exit 0
  }
else
  echo "You can start the panel with ./Start.sh -> 1. Start panel."
fi
