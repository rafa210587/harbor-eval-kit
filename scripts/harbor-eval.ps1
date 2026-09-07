param(
  [Parameter(Position=0)]
  [ValidateSet("doctor","install","status","init-evals","eval","uninstall","cleanup")]
  [string]$Command = "status",
  [switch]$DryRun,
  # Anything after the command (e.g. --path, --agent, --env) is forwarded as-is to `harbor run`.
  [Parameter(ValueFromRemainingArguments=$true)]
  [string[]]$Rest
)

$ErrorActionPreference = "Stop"
$Prefix = if ($env:HARBOR_EVAL_PREFIX) { $env:HARBOR_EVAL_PREFIX } else { "harbor-eval-kit-" }
$Label = if ($env:HARBOR_EVAL_LABEL) { $env:HARBOR_EVAL_LABEL } else { "io.harbor-eval-kit.managed=true" }
$StateDir = if ($env:HARBOR_EVAL_STATE_DIR) { $env:HARBOR_EVAL_STATE_DIR } else { Join-Path $HOME ".harbor-eval-kit" }
$Manifest = if ($env:HARBOR_EVAL_MANIFEST) { $env:HARBOR_EVAL_MANIFEST } else { Join-Path $StateDir "installation-manifest.json" }
function Has($name) { return $null -ne (Get-Command $name -ErrorAction SilentlyContinue) }

# `docker`/`harbor --env docker` default to a Docker CLI/SDK context (Docker Desktop's own pipe
# on Windows) instead of Podman's own Docker-compatible endpoint. Resolved per-platform and
# injected only around the `harbor` child process below (saved/restored via try/finally) --
# never leaks into the calling shell. Same logic as resolvePodmanDockerHost() in
# scripts/lib/harbor.ts; kept in sync by hand since this script is PowerShell, not Node.
function Resolve-PodmanDockerHost {
  if (-not (Has "podman")) { return $null }
  if ($IsWindows -or ($null -eq $IsWindows)) {
    # $IsWindows is $null on Windows PowerShell 5.1 (only pwsh 6+ defines it) -- treat unset as Windows.
    # Fixed, well-known pipe name Podman machine exposes for Docker-CLI/SDK compatibility,
    # distinct from its own per-machine-named native API pipe -- validated by every real
    # `harbor run` in this kit's own testing.
    return "npipe:////./pipe/docker_engine"
  }
  if ($IsMacOS) {
    # Podman on macOS always runs inside a VM ("podman machine"); its Docker-API socket path
    # is host-local but machine-name-dependent, so it's resolved dynamically.
    try {
      $path = (podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}' 2>$null | Select-Object -First 1)
      if ($path) { return "unix://$path" }
    } catch {}
    return $null
  }
  if ($IsLinux) {
    # Rootless Podman normally exposes its API socket directly (no VM/machine layer) -- that
    # socket already speaks the Docker-compatible dialect too. If a Podman machine is active
    # instead (uncommon on Linux, but supported), use the same machine-inspect path as macOS.
    try {
      $machines = (podman machine list --format json 2>$null | ConvertFrom-Json)
      if ($machines -and ($machines | Where-Object { $_.Running })) {
        $path = (podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}' 2>$null | Select-Object -First 1)
        if ($path) { return "unix://$path" }
      }
    } catch {}
    try {
      $path = (podman info --format '{{.Host.RemoteSocket.Path}}' 2>$null | Select-Object -First 1)
      if ($path) { return $(if ($path.StartsWith("unix://")) { $path } else { "unix://$path" }) }
    } catch {}
    return $null
  }
  return $null
}

function Installation-State([string]$Operation, [string]$Tool = "") {
  if (-not (Has "node")) { throw "Node.js 24+ is required to snapshot installation ownership." }
  $installationArgs = @($Operation, $Manifest)
  if ($Tool) { $installationArgs += $Tool }
  & node (Join-Path $PSScriptRoot "installation.ts") @installationArgs
  if ($LASTEXITCODE -ne 0) { throw "Installation ownership operation failed: $Operation" }
}

function Doctor {
  Write-Host "== Harbor Eval Kit doctor =="
  foreach ($t in @("podman","python","py","uv","java","javac","mvn","gradle","node","npm","npx","harbor")) {
    if (Has $t) {
      try { $v = (& $t --version 2>&1 | Select-Object -First 1) } catch { $v = "present" }
      Write-Host ("{0,-10} {1}" -f $t,$v)
    } else {
      Write-Host ("{0,-10} missing" -f $t)
    }
  }
  if (-not (Has "podman")) { throw "BLOCKED: Podman not found" }
  Installation-State "snapshot"
  Installation-State "smoke"
  Write-Host "Podman primitive smoke tests: PASS"
  Write-Host "Harbor<->Podman still requires an end-to-end Harbor task smoke test."
}

function Install {
  Installation-State "snapshot"
  Doctor
  if (-not (Has "uv")) {
    throw "uv missing. Install uv user-level in WSL/Linux or Windows, then rerun. This PowerShell wrapper refuses to silently install system-wide runtimes."
  }
  if (-not (Has "harbor")) {
    # Pinned, not "latest" -- same reasoning as harbor-eval.sh: this kit encodes one Harbor
    # release's CLI/output behaviour. Keep in lockstep with TESTED_HARBOR_VERSION in
    # scripts/lib/catalog.ts (a test enforces that they match).
    uv tool install "harbor==0.22.0"
    if ($LASTEXITCODE -ne 0) { throw "Harbor installation failed" }
    Installation-State "mark" "harbor"
  }
  harbor --help | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Harbor CLI smoke test failed" }
  Write-Host "Harbor CLI: PASS"
}

function Status { Doctor; Write-Host "Manifest: $Manifest" }

function Eval {
  if (-not $Rest -or $Rest.Count -eq 0) {
    Write-Host "Usage: harbor-eval.ps1 eval -- <harbor run args>"
    Write-Host "Example: .\scripts\harbor-eval.ps1 eval --path .\evals\python\seed-task --agent oracle --env docker"
    Write-Host "DOCKER_HOST is injected automatically for this call only (Podman gate, any OS); your shell's env is untouched."
    return
  }
  if (-not (Has "harbor")) { throw "harbor not found. Run '.\scripts\harbor-eval.ps1 install' first." }

  $prevDockerHost = $env:DOCKER_HOST
  try {
    if (-not $env:DOCKER_HOST) {
      $resolved = Resolve-PodmanDockerHost
      if ($resolved) { $env:DOCKER_HOST = $resolved }
      else { Write-Host "WARN: could not resolve Podman's Docker-compatible endpoint for this OS/config -- 'harbor run --env docker' may fail." }
    }
    harbor run @Rest
  } finally {
    $env:DOCKER_HOST = $prevDockerHost
  }
}

function Uninstall {
  if (-not (Has "node")) { throw "Node.js 24+ is required for manifest-verified cleanup." }
  $cleanupArgs = @("--manifest=$Manifest")
  if ($DryRun -or ($Rest -contains "--dry-run")) { $cleanupArgs += "--dry-run" }
  if (@($Rest | Where-Object { $_ -ne "--dry-run" }).Count -gt 0) { throw "Unknown cleanup argument" }
  & node (Join-Path $PSScriptRoot "cleanup.ts") @cleanupArgs
  if ($LASTEXITCODE -ne 0) { throw "Cleanup aborted; inspect the manifest and ownership before retrying." }
}
switch ($Command) {
  "doctor" { Doctor }
  "install" { Install }
  "status" { Status }
  "init-evals" { Write-Host "Eval templates are already in .\evals" }
  "eval" { Eval }
  "uninstall" { Uninstall }
  "cleanup" { Uninstall }
}
