#!/usr/bin/env bash
# Enables and starts the Harbor Eval Kit GUI: checks Harbor/Podman are installed, makes a
# best-effort attempt to bring the Podman machine up, then launches the local GUI server.
# Safe to re-run any time -- every step here is a no-op if already satisfied.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
have(){ command -v "$1" >/dev/null 2>&1; }

echo "== Harbor Eval Kit -- start-gui =="

if ! have node; then
  echo "BLOCKED: node not found. Install Node.js 22.6+ first (needed for native TS execution)." >&2
  exit 1
fi

if ! have harbor; then
  echo "Harbor CLI not found. Install it with:"
  echo "  uv tool install harbor"
  echo "(or ask Claude Code / Codex to follow Harbor_install/skills/harbor-bootstrap/SKILL.md,"
  echo "which does this plus the Podman compatibility check for you.)"
  exit 1
fi

if ! have podman; then
  echo "BLOCKED: podman not found. Install Podman first: https://podman.io/" >&2
  exit 1
fi

# Best-effort: bring the Podman machine up if this platform uses one (Windows/macOS).
# Rootless Podman on Linux typically has no machine to start -- ignore failures either way,
# `podman info` below is the real gate.
podman machine start >/dev/null 2>&1 || true

if ! podman info >/dev/null 2>&1; then
  echo "BLOCKED: 'podman info' failed. Run 'podman machine init && podman machine start' (or" >&2
  echo "the equivalent for your platform), then re-run this script." >&2
  exit 1
fi

echo "Harbor: $(harbor --version 2>&1 | head -n1)"
echo "Podman: $(podman --version 2>&1 | head -n1) -- info OK"
echo "Starting GUI at http://127.0.0.1:4173 ..."
exec node "$ROOT/scripts/gui-server.ts"
