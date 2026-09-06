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
# Windows-only: the Docker-compatible pipe Podman machine forwards to. `docker`/`harbor --env docker`
# default to Docker Desktop's own pipe instead, so this is injected only around the `harbor` child
# process below (saved/restored via try/finally) -- it never leaks into the calling shell.
$PodmanDockerHost = "npipe:////./pipe/docker_engine"

function Has($name) { return $null -ne (Get-Command $name -ErrorAction SilentlyContinue) }

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
    Write-Host "DOCKER_HOST is injected automatically for this call only (Windows/Podman gate); your shell's env is untouched."
    return
  }
  if (-not (Has "harbor")) { throw "harbor not found. Run '.\scripts\harbor-eval.ps1 install' first." }

  $prevDockerHost = $env:DOCKER_HOST
  try {
    if ($IsWindows) { $env:DOCKER_HOST = $PodmanDockerHost }
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
