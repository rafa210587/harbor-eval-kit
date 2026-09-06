#!/bin/bash
set -euo pipefail
cat > /app/solution.py <<'PY'
from math import gcd


def somar_fracoes(a, b):
    num = a[0] * b[1] + b[0] * a[1]
    den = a[1] * b[1]
    if den < 0:
        num, den = -num, -den
    d = gcd(abs(num), den) or 1
    return (num // d, den // d)
PY
