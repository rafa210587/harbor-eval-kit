# Activates this repo's versioned git hooks (.githooks/) for your local clone.
# Idempotent -- safe to run any time. Git never distributes hooks itself, so every clone has to
# do this once; the pre-commit hook is what makes "no credential can be pushed" a mechanism
# rather than a promise.
#
# The hook itself is bash: Git for Windows ships Git Bash and runs hooks with it, so the same
# hook works here, on macOS and on Linux without a second implementation to keep in sync.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

git config core.hooksPath .githooks

Write-Host "Hooks ativados: core.hooksPath = .githooks"
Write-Host "  pre-commit -> scripts/scan-secrets.sh --staged (bloqueia credencial no commit)"
Write-Host ""
Write-Host "Checando o repositório inteiro agora:"
bash scripts/scan-secrets.sh
if ($LASTEXITCODE -eq 0) {
  Write-Host "  ✓ nenhuma credencial encontrada nos arquivos versionados"
} else {
  Write-Error "Scan encontrou credencial — veja a saída acima."
  exit 1
}
