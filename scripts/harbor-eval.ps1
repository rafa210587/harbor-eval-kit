$ErrorActionPreference = "Stop"
$RawArgs = @($args)
$Command = if ($RawArgs.Count) { [string]$RawArgs[0] } else { "status" }
if ($Command -notin @("doctor","install","status","init-evals","eval","uninstall","cleanup")) {
  throw "Unknown command '$Command'. Use doctor|install|status|init-evals|eval|uninstall|cleanup."
}
$Rest = if ($RawArgs.Count -gt 1) { @($RawArgs[1..($RawArgs.Count - 1)]) } else { @() }
# A conventional `--` is optional. With no param() binder, Harbor flags remain opaque here.
if ($Rest.Count -and $Rest[0] -eq "--") { $Rest = @($Rest | Select-Object -Skip 1) }
$DryRun = ($Rest -contains "-DryRun") -or ($Rest -contains "--dry-run")
$Prefix = if ($env:HARBOR_EVAL_PREFIX) { $env:HARBOR_EVAL_PREFIX } else { "harbor-eval-kit-" }
$Label = if ($env:HARBOR_EVAL_LABEL) { $env:HARBOR_EVAL_LABEL } else { "io.harbor-eval-kit.managed=true" }
$StateDir = if ($env:HARBOR_EVAL_STATE_DIR) { $env:HARBOR_EVAL_STATE_DIR } else { Join-Path $HOME ".harbor-eval-kit" }
$Manifest = if ($env:HARBOR_EVAL_MANIFEST) { $env:HARBOR_EVAL_MANIFEST } else { Join-Path $StateDir "installation-manifest.json" }
function Has($name) { return $null -ne (Get-Command $name -ErrorAction SilentlyContinue) }

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
  Installation-State "gate"
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

function Status {
  & node (Join-Path $PSScriptRoot "harbor-cli.ts") status
  if ($LASTEXITCODE -ne 0) { throw "Status failed" }
  Write-Host "Manifest: $Manifest"
}

function Eval {
  if (-not $Rest -or $Rest.Count -eq 0) {
    Write-Host "Usage: harbor-eval.ps1 eval -- <harbor run args>"
    Write-Host "Example: .\scripts\harbor-eval.ps1 eval --path .\evals\python\seed-task --agent oracle --env docker"
    Write-Host "DOCKER_HOST is injected automatically for this call only (Podman gate, any OS); your shell's env is untouched."
    return
  }
  & node (Join-Path $PSScriptRoot "harbor-cli.ts") eval -- @Rest
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Uninstall {
  if (-not (Has "node")) { throw "Node.js 24+ is required for manifest-verified cleanup." }
  $cleanupArgs = @("--manifest=$Manifest")
  if ($DryRun) { $cleanupArgs += "--dry-run" }
  if (@($Rest | Where-Object { $_ -notin @("--dry-run", "-DryRun") }).Count -gt 0) { throw "Unknown cleanup argument" }
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
