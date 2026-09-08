#!/bin/bash
set -euo pipefail
mkdir -p /logs/verifier
mkdir -p /logs/artifacts
echo 0 > /logs/verifier/reward.txt
cd /app
export PYTHONPATH=/app
if [ -f /app/solution.py ]; then cp /app/solution.py /logs/artifacts/solution.py; fi
if python /tests/test_outputs.py -v > /logs/verifier/test-output.txt 2>&1; then
  echo 1 > /logs/verifier/reward.txt
fi
cat /logs/verifier/test-output.txt
