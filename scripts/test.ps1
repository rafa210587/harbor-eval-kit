# Runs the whole suite: unit tests (node:test) + the credential scanner over the repo.
#
# No test framework, no build step, no node_modules -- `node --test` runs the .ts files
# directly via Node's native type stripping, same as every other script in this kit.
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$status = 0

Write-Host "== Testes unitários =="
$testFiles = Get-ChildItem -Path "scripts/lib" -Filter "*.test.ts" | ForEach-Object { $_.FullName }
node --test @testFiles
if ($LASTEXITCODE -ne 0) { $status = 1 }

Write-Host ""
Write-Host "== Scan de credenciais (arquivos versionados) =="
bash scripts/scan-secrets.sh
if ($LASTEXITCODE -eq 0) {
  Write-Host "  ✓ nenhuma credencial encontrada"
} else {
  $status = 1
}

Write-Host ""
if ($status -eq 0) {
  Write-Host "TUDO VERDE"
} else {
  Write-Error "FALHOU — veja acima."
}
exit $status
