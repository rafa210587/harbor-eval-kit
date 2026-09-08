#!/usr/bin/env bash
# Idempotent foreground launcher. Operational callers may background this wrapper.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="4173"
args=("$@")
i=0
while [ "$i" -lt "$#" ]; do
  value="${args[$i]}"
  case "$value" in
    --port=*) PORT="${value#--port=}" ;;
    --port)
      i=$((i + 1))
      [ "$i" -lt "$#" ] || { echo "BLOCKED: --port requires a value" >&2; exit 2; }
      PORT="${args[$i]}"
      ;;
  esac
  i=$((i + 1))
done

command -v node >/dev/null 2>&1 || { echo "BLOCKED: Node.js 24+ is required." >&2; exit 1; }
node -e "if (Number(process.versions.node.split('.')[0]) < 24) process.exit(1)" || {
  echo "BLOCKED: Node.js 24+ is required." >&2
  exit 1
}

set +e
node "$ROOT/scripts/gui-lifecycle.ts" preflight --port "$PORT" --root "$ROOT"
preflight_code=$?
set -e
if [ "$preflight_code" -eq 20 ]; then exit 0; fi
if [ "$preflight_code" -ne 0 ]; then exit "$preflight_code"; fi

echo "Starting Harbor Eval Kit GUI at http://127.0.0.1:$PORT ..."
cd "$ROOT"
exec node "$ROOT/scripts/gui-server.ts" "$@"
