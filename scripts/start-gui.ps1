# Idempotent foreground launcher. Operational callers may background this wrapper.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Port = 4173
for ($i = 0; $i -lt $args.Count; $i++) {
  if ($args[$i] -match '^--port=(\d+)$') { $Port = [int]$Matches[1] }
  elseif ($args[$i] -eq "--port") {
    if ($i + 1 -ge $args.Count) { throw "--port requires a value" }
    $i += 1
    $Port = [int]$args[$i]
  }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 24+ is required." }
& node -e "if (Number(process.versions.node.split('.')[0]) < 24) process.exit(1)"
if ($LASTEXITCODE -ne 0) { throw "Node.js 24+ is required." }

& node (Join-Path $PSScriptRoot "gui-lifecycle.ts") preflight --port "$Port" --root "$Root"
$preflightCode = $LASTEXITCODE
if ($preflightCode -eq 20) { exit 0 }
if ($preflightCode -ne 0) { exit $preflightCode }

Write-Host "Starting Harbor Eval Kit GUI at http://127.0.0.1:$Port ..."
Set-Location $Root
& node (Join-Path $PSScriptRoot "gui-server.ts") @args
exit $LASTEXITCODE
