param([int]$Port = 4173)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
& node (Join-Path $PSScriptRoot "gui-lifecycle.ts") stop --port "$Port" --root "$Root"
exit $LASTEXITCODE
