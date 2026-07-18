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
