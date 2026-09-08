#!/bin/bash
set -euo pipefail
cat > /app/solution.py <<'PY'
from decimal import Decimal
import re


def _centavos(valor):
    sinal, digitos, expoente = valor.as_tuple()
    coeficiente = int("".join(map(str, digitos)) or "0")
    centavos = coeficiente * (10 ** (expoente + 2))
    return -centavos if sinal else centavos


def _dinheiro(centavos):
    sinal = "-" if centavos < 0 else ""
    centavos = abs(centavos)
    return f"{sinal}{centavos // 100}.{centavos % 100:02d}"


def resumir_itens(itens):
    if not isinstance(itens, list):
        raise ValueError("itens deve ser lista")
    grupos = {}
    for item in itens:
        if not isinstance(item, dict) or set(item) != {"codigo", "quantidade", "preco_unitario"}:
            raise ValueError("item invalido")
        codigo = item["codigo"]
        quantidade = item["quantidade"]
        preco_texto = item["preco_unitario"]
        if not isinstance(codigo, str) or not codigo.strip():
            raise ValueError("codigo invalido")
        if isinstance(quantidade, bool) or not isinstance(quantidade, int) or quantidade <= 0:
            raise ValueError("quantidade invalida")
        if not isinstance(preco_texto, str):
            raise ValueError("preco invalido")
        if re.fullmatch(r"(0|[1-9][0-9]*)(\.[0-9]{1,2})?", preco_texto) is None:
            raise ValueError("preco invalido")
        preco = Decimal(preco_texto)
        chave = codigo.strip().upper()
        qtd, total = grupos.get(chave, (0, 0))
        grupos[chave] = (qtd + quantidade, total + quantidade * _centavos(preco))
    return [
        {"codigo": codigo, "quantidade": grupos[codigo][0], "total": _dinheiro(grupos[codigo][1])}
        for codigo in sorted(grupos)
    ]
PY
