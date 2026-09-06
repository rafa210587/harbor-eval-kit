#!/bin/bash
mkdir -p /logs/verifier
cd /app
python - <<'PY' > /logs/verifier/test-output.txt 2>&1
import sys
sys.path.insert(0, "/app")
try:
    from solution import somar_fracoes
except Exception as e:
    print("IMPORT_FAIL", e)
    raise SystemExit(1)

casos = [
    (((1, 2), (1, 3)), (5, 6)),
    (((1, 4), (1, 4)), (1, 2)),
    (((2, 3), (-2, 3)), (0, 1)),
    (((3, 4), (5, 6)), (19, 12)),
    (((1, -2), (1, 2)), (0, 1)),
]
falhas = 0
for entrada, esperado in casos:
    try:
        obtido = somar_fracoes(*entrada)
    except Exception as e:
        print("ERRO", entrada, e)
        falhas += 1
        continue
    if tuple(obtido) != esperado:
        print("FALHOU", entrada, "esperado", esperado, "obtido", obtido)
        falhas += 1
    else:
        print("OK", entrada, "->", obtido)
print("FALHAS", falhas)
raise SystemExit(1 if falhas else 0)
PY
CODE=$?
cat /logs/verifier/test-output.txt
if [ "$CODE" -eq 0 ]; then echo 1 > /logs/verifier/reward.txt; else echo 0 > /logs/verifier/reward.txt; fi
exit 0
