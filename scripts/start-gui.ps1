# Enables and starts the Harbor Eval Kit GUI: checks Harbor/Podman are installed, makes a
# best-effort attempt to bring the Podman machine up, then launches the local GUI server.
# Safe to re-run any time -- every step here is a no-op if already satisfied.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

function Test-Command($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

Write-Host "== Harbor Eval Kit -- start-gui =="

if (-not (Test-Command "node")) {
  Write-Error "BLOCKED: node not found. Install Node.js 22.6+ first (needed for native TS execution)."
  exit 1
}

if (-not (Test-Command "harbor")) {
  Write-Host "Harbor CLI not found. Install it with:"
  Write-Host "  uv tool install harbor"
  Write-Host "(or ask Claude Code / Codex to follow Harbor_install\skills\harbor-bootstrap\SKILL.md,"
  Write-Host "which does this plus the Podman compatibility check for you.)"
  exit 1
}

if (-not (Test-Command "podman")) {
  Write-Error "BLOCKED: podman not found. Install Podman first: https://podman.io/"
  exit 1
}

# Best-effort: bring the Podman machine up. Ignore failures -- 'podman info' below is the
# real gate (it's already running, or this platform doesn't use a machine at all).
try { podman machine start *> $null } catch {}

podman info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Error "BLOCKED: 'podman info' failed. Run 'podman machine init' then 'podman machine start', then re-run this script."
  exit 1
}

Write-Host "Harbor: $((harbor --version 2>&1) | Select-Object -First 1)"
Write-Host "Podman: $((podman --version 2>&1) | Select-Object -First 1) -- info OK"
Write-Host "Starting GUI at http://127.0.0.1:4173 ..."
& node "$Root\scripts\gui-server.ts"
