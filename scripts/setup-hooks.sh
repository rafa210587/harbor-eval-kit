#!/usr/bin/env bash
# Activates this repo's versioned git hooks (.githooks/) for your local clone.
# Idempotent -- safe to run any time. Git never distributes hooks itself, so every clone has to
# do this once; the pre-commit hook is what makes "no credential can be pushed" a mechanism
# rather than a promise.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

git config core.hooksPath .githooks
chmod +x .githooks/* scripts/*.sh 2>/dev/null || true

echo "Hooks ativados: core.hooksPath = .githooks"
echo "  pre-commit -> scripts/scan-secrets.sh --staged (bloqueia credencial no commit)"
echo
echo "Checando o repositório inteiro agora:"
if bash scripts/scan-secrets.sh; then
  echo "  ✓ nenhuma credencial encontrada nos arquivos versionados"
fi
