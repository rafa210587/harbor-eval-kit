#!/usr/bin/env bash
# Runs the whole suite: unit tests (node:test) + the credential scanner over the repo.
#
# No test framework, no build step, no node_modules -- `node --test` runs the .ts files
# directly via Node's native type stripping, same as every other script in this kit.
#
# Usage: bash scripts/test.sh          (macOS/Linux/Git Bash)
#        pwsh scripts/test.ps1         (Windows PowerShell)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

status=0

echo "== Testes unitários =="
# Globbed explicitly: `node --test <dir>` needs a directory Node can resolve as a module root,
# which scripts/lib is not.
if ! node --test scripts/lib/*.test.ts; then
  status=1
fi

echo
echo "== Imports e ciclos (backend + GUI) =="
if ! node scripts/check-imports.mjs; then
  status=1
fi

echo
echo "== Scan de credenciais (versionados + novos não ignorados) =="
if bash scripts/scan-secrets.sh; then
  echo "  ✓ nenhuma credencial encontrada"
else
  status=1
fi

echo
if [ "$status" -eq 0 ]; then
  echo "TUDO VERDE"
else
  echo "FALHOU — veja acima." >&2
fi
exit "$status"
