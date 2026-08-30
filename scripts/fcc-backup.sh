#!/usr/bin/env bash
# ==============================================================================
# Factorio Control Center (FCC) — Backup & Restore CLI
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DATA_DIR="${ROOT_DIR}/data"
DB_DIR="${DATA_DIR}/db"
STORAGE_DIR="${DATA_DIR}/storage"
BACKUPS_DIR="${DATA_DIR}/backups"
FCC_VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${ROOT_DIR}/package.json" 2>/dev/null | head -1)"
FCC_VERSION="${FCC_VERSION:-unknown}"

RED="\033[0;31m"; GREEN="\033[0;32m"; YELLOW="\033[1;33m"; CYAN="\033[0;36m"; NC="\033[0m"
BLD="\033[1m"

mkdir -p "${BACKUPS_DIR}"

# ── Helpers ───────────────────────────────────────────────────────────────────
print_header() {
  clear 2>/dev/null || true
  echo -e "${CYAN}${BLD}"
  echo "╔══════════════════════════════════════════════════╗"
  echo "║     FCC Backup & Restore Tool       ║"
  echo "║  Root: ${ROOT_DIR}"
  echo "╚══════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

format_bytes() {
  local b=$1
  if (( b < 1024 )); then echo "${b} B"
  elif (( b < 1048576 )); then echo "$(( b / 1024 )) KB"
  else echo "$(( b / 1048576 )) MB"
  fi
}

# ── 1. Create Backup ─────────────────────────────────────────────────────────
do_create() {
  local include_metrics="${1:-}"
  local include_logs="${2:-}"

  if [[ -z "$include_metrics" ]]; then
    echo ""
    echo -e "${CYAN}=== Create Local Backup ===${NC}"
    read -rp "Include metrics database (fcc_metrics.sqlite)? [y/N] " r1
    [[ "$r1" =~ ^[Yy] ]] && include_metrics="true" || include_metrics="false"
    read -rp "Include instance logs (data/logs)? [y/N] " r2
    [[ "$r2" =~ ^[Yy] ]] && include_logs="true" || include_logs="false"
  fi

  local ts
  ts="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"
  local zip_name="fcc-backup-manual-${ts}.zip"
  local target_zip="${BACKUPS_DIR}/${zip_name}"

  local tmp_dir
  tmp_dir="$(mktemp -d -t fcc-backup-XXXXXX)"
  trap 'rm -rf "${tmp_dir}"' EXIT

  echo -e "${YELLOW}Gathering files…${NC}"
  local sections=("database")

  # 1. Main Database
  if [[ -f "${DB_DIR}/fcc_database.sqlite" ]]; then
    mkdir -p "${tmp_dir}/database"
    if command -v sqlite3 >/dev/null 2>&1; then
      sqlite3 "${DB_DIR}/fcc_database.sqlite" ".backup '${tmp_dir}/database/fcc_database.sqlite'" 2>/dev/null || \
        cp "${DB_DIR}/fcc_database.sqlite" "${tmp_dir}/database/"
    else
      cp "${DB_DIR}/fcc_database.sqlite" "${tmp_dir}/database/"
    fi
  fi

  # 2. Metrics DB
  if [[ "$include_metrics" == "true" && -f "${DB_DIR}/fcc_metrics.sqlite" ]]; then
    mkdir -p "${tmp_dir}/database"
    if command -v sqlite3 >/dev/null 2>&1; then
      sqlite3 "${DB_DIR}/fcc_metrics.sqlite" ".backup '${tmp_dir}/database/fcc_metrics.sqlite'" 2>/dev/null || \
        cp "${DB_DIR}/fcc_metrics.sqlite" "${tmp_dir}/database/"
    else
      cp "${DB_DIR}/fcc_metrics.sqlite" "${tmp_dir}/database/"
    fi
    sections+=("metrics")
  fi

  # 3. Security / TLS
  if [[ -d "${DATA_DIR}/security/tls" && -n "$(ls -A "${DATA_DIR}/security/tls" 2>/dev/null)" ]]; then
    mkdir -p "${tmp_dir}/security/tls"
    cp -r "${DATA_DIR}/security/tls/"* "${tmp_dir}/security/tls/" 2>/dev/null || true
    sections+=("tls")
  fi

  # 4. Map Presets
  if [[ -d "${STORAGE_DIR}/map_presets" && -n "$(ls -A "${STORAGE_DIR}/map_presets" 2>/dev/null)" ]]; then
    mkdir -p "${tmp_dir}/storage/map_presets"
    cp -r "${STORAGE_DIR}/map_presets/"* "${tmp_dir}/storage/map_presets/" 2>/dev/null || true
    sections+=("map_presets")
  fi

  # 5. Announcements
  if [[ -d "${STORAGE_DIR}/announcements" && -n "$(ls -A "${STORAGE_DIR}/announcements" 2>/dev/null)" ]]; then
    mkdir -p "${tmp_dir}/storage/announcements"
    cp -r "${STORAGE_DIR}/announcements/"* "${tmp_dir}/storage/announcements/" 2>/dev/null || true
    sections+=("announcements")
  fi

  # 6. Instance Logs
  if [[ "$include_logs" == "true" && -d "${DATA_DIR}/logs/instances" && -n "$(ls -A "${DATA_DIR}/logs/instances" 2>/dev/null)" ]]; then
    mkdir -p "${tmp_dir}/logs/instances"
    cp -r "${DATA_DIR}/logs/instances/"* "${tmp_dir}/logs/instances/" 2>/dev/null || true
    sections+=("instance_logs")
  fi

  # 7. Environment file
  if [[ -f "${ROOT_DIR}/.env" ]]; then
    cp "${ROOT_DIR}/.env" "${tmp_dir}/.env"
    sections+=("env")
  fi

  # 8. Manifest JSON
  local iso_date
  iso_date="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
  local sections_json
  sections_json="$(printf '"%s",' "${sections[@]}")"
  sections_json="[${sections_json%,}]"

  cat <<EOF > "${tmp_dir}/manifest.json"
{
  "fccVersion": "${FCC_VERSION}",
  "createdAt": "${iso_date}",
  "type": "manual",
  "sections": ${sections_json},
  "sha256": {}
}
EOF

  # 9. Create ZIP archive
  echo -e "${YELLOW}Packing into ${zip_name}…${NC}"
  (cd "${tmp_dir}" && zip -q -r "${target_zip}" ./* ./.env 2>/dev/null || zip -q -r "${target_zip}" ./*)

  local sz
  sz="$(stat -c%s "${target_zip}" 2>/dev/null || stat -f%z "${target_zip}" 2>/dev/null || echo 0)"
  echo -e "${GREEN}✓ Backup created successfully!${NC}"
  echo -e "  File: ${BLD}${target_zip}${NC} ($(format_bytes "${sz}"))"
  echo -e "  Sections: ${sections[*]}"
}

# ── 2. List Backups ──────────────────────────────────────────────────────────
do_list() {
  echo ""
  echo -e "${CYAN}=== Available Backups (${BACKUPS_DIR}) ===${NC}"
  local count=0

  # Sort newest first
  for f in $(ls -1t "${BACKUPS_DIR}"/fcc-backup-*.zip 2>/dev/null || true); do
    [[ ! -f "$f" ]] && continue
    count=$((count + 1))
    local bname; bname="$(basename "$f")"
    local sz; sz="$(stat -c%s "$f" 2>/dev/null || stat -f%z "$f" 2>/dev/null || echo 0)"
    local dt; dt="$(date -r "$f" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "—")"
    
    local btype="Manual"
    if [[ "$bname" =~ -auto- ]]; then btype="Auto"
    elif [[ "$bname" =~ -uploaded- ]]; then btype="Uploaded"
    fi

    printf "  ${BLD}%2d.${NC} %-48s | %-8s | %-19s | %s\n" "$count" "$bname" "$btype" "$dt" "$(format_bytes "$sz")"
  done

  if (( count == 0 )); then
    echo "  (no backup archives found in ${BACKUPS_DIR})"
  fi
}

# ── 3. Restore Backup ────────────────────────────────────────────────────────
do_restore() {
  do_list
  echo ""
  read -rp "Enter backup archive name to restore (or leave empty to cancel): " target
  [[ -z "$target" ]] && return

  local zip_path="${BACKUPS_DIR}/${target}"
  if [[ ! -f "$zip_path" ]]; then
    # Try appending .zip if omitted
    if [[ -f "${BACKUPS_DIR}/${target}.zip" ]]; then
      zip_path="${BACKUPS_DIR}/${target}.zip"
    else
      echo -e "${RED}Error: File '${target}' not found in ${BACKUPS_DIR}${NC}"
      return
    fi
  fi

  echo ""
  echo -e "${YELLOW}${BLD}Select restore mode:${NC}"
  echo "  1. All"
  echo "  2. Database only"
  echo "  3. Files only"
  read -rp "Mode [1/2/3] (default: 1): " mode_choice
  mode_choice="${mode_choice:-1}"

  read -rp "Are you sure you want to overwrite local data? Type YES to confirm: " confirm
  if [[ "$confirm" != "YES" ]]; then
    echo "Restore cancelled."
    return
  fi

  local tmp_extract
  tmp_extract="$(mktemp -d -t fcc-restore-XXXXXX)"
  trap 'rm -rf "${tmp_extract}"' EXIT

  echo -e "${YELLOW}Extracting archive…${NC}"
  unzip -q -o "${zip_path}" -d "${tmp_extract}"

  # 1. Restore DB
  if [[ "$mode_choice" == "1" || "$mode_choice" == "2" ]]; then
    if [[ -f "${tmp_extract}/database/fcc_database.sqlite" ]]; then
      mkdir -p "${DB_DIR}"
      cp -f "${tmp_extract}/database/fcc_database.sqlite" "${DB_DIR}/fcc_database.sqlite"
      echo -e "  ${GREEN}✓ Restored:${NC} fcc_database.sqlite"
    fi
    if [[ -f "${tmp_extract}/database/fcc_metrics.sqlite" ]]; then
      mkdir -p "${DB_DIR}"
      cp -f "${tmp_extract}/database/fcc_metrics.sqlite" "${DB_DIR}/fcc_metrics.sqlite"
      echo -e "  ${GREEN}✓ Restored:${NC} fcc_metrics.sqlite"
    fi
  fi

  # 2. Restore Files
  if [[ "$mode_choice" == "1" || "$mode_choice" == "3" ]]; then
    if [[ -d "${tmp_extract}/security/tls" ]]; then
      mkdir -p "${DATA_DIR}/security/tls"
      cp -rf "${tmp_extract}/security/tls/"* "${DATA_DIR}/security/tls/" 2>/dev/null || true
      echo -e "  ${GREEN}✓ Restored:${NC} security/tls"
    fi
    # Handle both old (map_presets/) and new (storage/map_presets/) zip layout
    local map_src="${tmp_extract}/storage/map_presets"
    [[ ! -d "$map_src" ]] && map_src="${tmp_extract}/map_presets"
    if [[ -d "$map_src" ]]; then
      mkdir -p "${STORAGE_DIR}/map_presets"
      cp -rf "${map_src}/"* "${STORAGE_DIR}/map_presets/" 2>/dev/null || true
      echo -e "  ${GREEN}✓ Restored:${NC} storage/map_presets"
    fi
    # Handle both old (announcements/) and new (storage/announcements/) zip layout
    local ann_src="${tmp_extract}/storage/announcements"
    [[ ! -d "$ann_src" ]] && ann_src="${tmp_extract}/announcements"
    if [[ -d "$ann_src" ]]; then
      mkdir -p "${STORAGE_DIR}/announcements"
      cp -rf "${ann_src}/"* "${STORAGE_DIR}/announcements/" 2>/dev/null || true
      echo -e "  ${GREEN}✓ Restored:${NC} storage/announcements"
    fi
    if [[ -f "${tmp_extract}/env/.env" ]]; then
      cp -f "${tmp_extract}/env/.env" "${ROOT_DIR}/.env"
      echo -e "  ${GREEN}✓ Restored:${NC} .env"
    elif [[ -f "${tmp_extract}/.env" ]]; then
      cp -f "${tmp_extract}/.env" "${ROOT_DIR}/.env"
      echo -e "  ${GREEN}✓ Restored:${NC} .env"
    fi
  fi

  echo -e "${GREEN}${BLD}✓ Restore complete!${NC}"
  echo "If the FCC service is currently running, restart it to apply changes:"
  echo "  pm2 restart fcc  (or: systemctl restart fcc / docker compose restart)"
}

# ── 4. Delete Backup ─────────────────────────────────────────────────────────
do_delete() {
  do_list
  echo ""
  read -rp "Enter backup archive name to delete (or leave empty to cancel): " target
  [[ -z "$target" ]] && return

  local zip_path="${BACKUPS_DIR}/${target}"
  if [[ ! -f "$zip_path" ]]; then
    if [[ -f "${BACKUPS_DIR}/${target}.zip" ]]; then
      zip_path="${BACKUPS_DIR}/${target}.zip"
    else
      echo -e "${RED}Error: File '${target}' not found.${NC}"
      return
    fi
  fi

  read -rp "Delete $(basename "$zip_path")? [y/N] " confirm
  if [[ "$confirm" =~ ^[Yy] ]]; then
    rm -f "$zip_path"
    echo -e "${GREEN}Deleted: $(basename "$zip_path")${NC}"
  else
    echo "Cancelled."
  fi
}

# ── CLI Non-interactive arguments handling ───────────────────────────────────
if [[ $# -gt 0 ]]; then
  case "$1" in
    create)
      do_create "${2:-false}" "${3:-false}"
      exit 0
      ;;
    list)
      do_list
      exit 0
      ;;
    restore)
      if [[ -z "${2:-}" ]]; then
        echo "Usage: bash scripts/fcc-backup.sh restore <filename.zip>"
        exit 1
      fi
      # Direct non-interactive restore
      zip_path="${BACKUPS_DIR}/$2"
      [[ ! -f "$zip_path" && -f "${BACKUPS_DIR}/$2.zip" ]] && zip_path="${BACKUPS_DIR}/$2.zip"
      if [[ ! -f "$zip_path" ]]; then
        echo -e "${RED}File $2 not found.${NC}"; exit 1
      fi
      tmp_extract="$(mktemp -d -t fcc-restore-XXXXXX)"
      unzip -q -o "${zip_path}" -d "${tmp_extract}"
      # Database
      [[ -f "${tmp_extract}/database/fcc_database.sqlite" ]] && mkdir -p "${DB_DIR}" && \
        cp -f "${tmp_extract}/database/fcc_database.sqlite" "${DB_DIR}/fcc_database.sqlite"
      [[ -f "${tmp_extract}/database/fcc_metrics.sqlite" ]] && mkdir -p "${DB_DIR}" && \
        cp -f "${tmp_extract}/database/fcc_metrics.sqlite" "${DB_DIR}/fcc_metrics.sqlite"
      # TLS
      [[ -d "${tmp_extract}/security/tls" ]] && mkdir -p "${DATA_DIR}/security/tls" && \
        cp -rf "${tmp_extract}/security/tls/"* "${DATA_DIR}/security/tls/" 2>/dev/null || true
      # Map presets (handle both zip layouts)
      _mp_src="${tmp_extract}/storage/map_presets"
      [[ ! -d "$_mp_src" ]] && _mp_src="${tmp_extract}/map_presets"
      [[ -d "$_mp_src" ]] && mkdir -p "${STORAGE_DIR}/map_presets" && \
        cp -rf "${_mp_src}/"* "${STORAGE_DIR}/map_presets/" 2>/dev/null || true
      # Announcements (handle both zip layouts)
      _ann_src="${tmp_extract}/storage/announcements"
      [[ ! -d "$_ann_src" ]] && _ann_src="${tmp_extract}/announcements"
      [[ -d "$_ann_src" ]] && mkdir -p "${STORAGE_DIR}/announcements" && \
        cp -rf "${_ann_src}/"* "${STORAGE_DIR}/announcements/" 2>/dev/null || true
      # .env
      [[ -f "${tmp_extract}/env/.env" ]] && cp -f "${tmp_extract}/env/.env" "${ROOT_DIR}/.env"
      [[ -f "${tmp_extract}/.env" ]] && cp -f "${tmp_extract}/.env" "${ROOT_DIR}/.env"
      rm -rf "${tmp_extract}"
      echo -e "${GREEN}Restored from $2${NC}"
      exit 0
      ;;
    delete)
      if [[ -z "${2:-}" ]]; then
        echo "Usage: bash scripts/fcc-backup.sh delete <filename.zip>"
        exit 1
      fi
      rm -f "${BACKUPS_DIR}/$2" "${BACKUPS_DIR}/$2.zip"
      echo "Deleted $2"
      exit 0
      ;;
    *)
      echo "Usage: bash scripts/fcc-backup.sh [create|list|restore <file>|delete <file>]"
      exit 1
      ;;
  esac
fi

# ── Interactive TUI Menu ─────────────────────────────────────────────────────
while true; do
  print_header
  echo "  1. Create backup"
  echo "  2. List backups"
  echo "  3. Restore from backup"
  echo "  4. Delete backup"
  echo "  0. Exit"
  echo ""
  read -rp "Select option: " choice
  case "$choice" in
    1) do_create "" "";;
    2) do_list ;;
    3) do_restore ;;
    4) do_delete ;;
    0) echo "Bye!"; exit 0 ;;
    *) echo -e "${RED}Invalid option.${NC}" ;;
  esac
  echo ""
  read -rp "Press Enter to continue…"
done