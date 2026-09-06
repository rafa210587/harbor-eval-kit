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
  podman info | Out-Null
  Write-Host "Podman info: PASS"
  Write-Host "Harbor<->Podman still requires an end-to-end Harbor task smoke test."
}

function Install {
  Doctor
  if (-not (Has "uv")) {
    throw "uv missing. Install uv user-level in WSL/Linux or Windows, then rerun. This PowerShell wrapper refuses to silently install system-wide runtimes."
  }
  if (-not (Has "harbor")) {
    uv tool install harbor
  }
  harbor --help | Out-Null
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
  Write-Host "Managed resources selected strictly by label: $Label"
  podman ps -a --filter "label=$Label"
  podman images --filter "label=$Label"
  podman volume ls --filter "label=$Label"
  podman network ls --filter "label=$Label"

  if ($DryRun) {
    Write-Host "DRY RUN: nothing removed."
    return
  }

  $containers = @(podman ps -aq --filter "label=$Label")
  if ($containers.Count -gt 0) { podman rm -f $containers }

  $volumes = @(podman volume ls -q --filter "label=$Label")
  if ($volumes.Count -gt 0) { podman volume rm $volumes }

  $networks = @(podman network ls -q --filter "label=$Label")
  if ($networks.Count -gt 0) { podman network rm $networks }

  $images = @(podman images -q --filter "label=$Label")
  if ($images.Count -gt 0) { podman rmi $images }

  Write-Host "Podman and preexisting toolchains preserved."
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
