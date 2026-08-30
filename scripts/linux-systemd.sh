#!/usr/bin/env bash
# Shared helpers for systemd system units (root vs sudo).

is_root() {
  [[ "$(id -u)" -eq 0 ]]
}

systemctl_system() {
  if is_root; then
    systemctl "$@"
  else
    sudo systemctl "$@"
  fi
}

default_service_scope() {
  if is_root; then
    echo system
  else
    echo user
  fi
}

service_scope_hint() {
  if is_root; then
    echo "Running as root: using system service"
  fi
}

ensure_linux_executables() {
  local fcc_dir="${1:-}"
  [[ -z "$fcc_dir" ]] && return 0
  if [[ -f "$fcc_dir/Start.sh" ]]; then
    chmod +x "$fcc_dir/Start.sh" 2>/dev/null || true
  fi
  if [[ -d "$fcc_dir/scripts" ]]; then
    chmod +x "$fcc_dir"/scripts/*.sh 2>/dev/null || true
  fi
}

ensure_build_tools() {
  if command -v make >/dev/null 2>&1 && (command -v g++ >/dev/null 2>&1 || command -v gcc >/dev/null 2>&1); then
    return 0
  fi
  echo "Build tools (make/g++) not found. Installing for native dependencies..."
  if is_root; then
    if command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq && apt-get install -y build-essential
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y make gcc-c++
    elif command -v yum >/dev/null 2>&1; then
      yum install -y make gcc-c++
    elif command -v pacman >/dev/null 2>&1; then
      pacman -Sy --noconfirm base-devel
    elif command -v apk >/dev/null 2>&1; then
      apk add --no-cache build-base python3
    fi
  elif command -v sudo >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
      sudo apt-get update -qq && sudo apt-get install -y build-essential
    elif command -v dnf >/dev/null 2>&1; then
      sudo dnf install -y make gcc-c++
    elif command -v yum >/dev/null 2>&1; then
      sudo yum install -y make gcc-c++
    elif command -v pacman >/dev/null 2>&1; then
      sudo pacman -Sy --noconfirm base-devel
    elif command -v apk >/dev/null 2>&1; then
      sudo apk add --no-cache build-base python3
    fi
  else
    echo "WARNING: make or g++ is missing. If native compilation fails, please install build-essential or gcc-c++."
  fi
}

user_systemd_env() {
  if is_root; then
    return 0
  fi
  local uid=""
  uid="$(id -u 2>/dev/null || true)"
  [[ -n "$uid" ]] || return 0
  if [[ -z "${XDG_RUNTIME_DIR:-}" && -d "/run/user/${uid}" ]]; then
    export XDG_RUNTIME_DIR="/run/user/${uid}"
  fi
}

systemctl_user() {
  user_systemd_env
  systemctl --user "$@"
}
