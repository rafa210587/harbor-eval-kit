#!/usr/bin/env bash
# Stops only this repository's GUI process; a foreign listener on the port is untouched.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${1:-4173}"
exec node "$ROOT/scripts/gui-lifecycle.ts" stop --port "$PORT" --root "$ROOT"
