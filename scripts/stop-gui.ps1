# Stops the Harbor Eval Kit GUI server started by start-gui.ps1, by finding whichever process
# is listening on its port and asking it to exit -- does not touch podman/harbor/containers.
# Safe to re-run: reports "not running" instead of failing if nothing is listening.
param(
  [int]$Port = 4173
)

$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $conn) {
  Write-Host "Harbor Eval Kit GUI does not appear to be running on port $Port."
  exit 0
}

$processId = $conn.OwningProcess
Write-Host "Stopping Harbor Eval Kit GUI (pid $processId, port $Port)..."
try {
  Stop-Process -Id $processId -ErrorAction Stop
  Write-Host "Stopped."
} catch {
  Write-Error "Could not stop pid $processId : $_"
  exit 1
}
