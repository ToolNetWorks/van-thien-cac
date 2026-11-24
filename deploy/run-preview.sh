#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8081}"
if ! [[ "$PORT" =~ ^[0-9]{1,5}$ ]] || (( PORT < 1024 || PORT > 65535 )); then
  echo "ERROR: PORT must be between 1024 and 65535." >&2
  exit 1
fi
cd "$ROOT_DIR"
exec python3 "$ROOT_DIR/tools/serve_site.py" --port "$PORT" --bind 0.0.0.0
