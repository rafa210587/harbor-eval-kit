export const SAFE_TEST_SH_TEMPLATE = `#!/bin/bash
set -uo pipefail
mkdir -p /logs/verifier

# Falha segura: o esqueleto nunca aprova uma task sem teste real.
echo 0 > /logs/verifier/reward.txt

# Dependencias de TESTE vao aqui, nao no Dockerfile.
# pip install --no-cache-dir pytest==8.4.1

# Substitua este bloco pelo comando de teste real. Preserve a captura de status para que
# reward.txt seja gravado mesmo quando o comando falhar sob set -e.
echo "ERRO: substitua o stub de tests/test.sh por uma verificacao real" >&2
exit 1

# Exemplo:
# pytest -q /tests/test_outputs.py > /logs/verifier/test-stdout.txt 2>&1
# STATUS=$?
# if [ "$STATUS" -eq 0 ]; then
#   echo 1 > /logs/verifier/reward.txt
# else
#   echo 0 > /logs/verifier/reward.txt
# fi
# exit "$STATUS"`;
