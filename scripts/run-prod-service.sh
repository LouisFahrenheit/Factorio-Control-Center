#!/usr/bin/env bash
# Production entry point for systemd and other service managers.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FCC_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
export FCC_ROOT_DIR="$FCC_DIR"

cd "$FCC_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js not found in PATH." >&2
  exit 1
fi

if [[ ! -f "$FCC_DIR/dist/main.js" ]]; then
  echo "ERROR: dist/main.js not found. Run from a release bundle or build first." >&2
  exit 1
fi

exec node dist/main.js
