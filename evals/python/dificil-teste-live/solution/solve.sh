#!/bin/bash
set -euo pipefail
cat > /app/solution.py <<'PY'
from decimal import Decimal
import re


class EventoInvalidoError(ValueError): pass
class EventoConflitanteError(ValueError): pass
class SaldoInsuficienteError(ValueError): pass


def _centavos(valor):
    sinal, digitos, expoente = valor.as_tuple()
    coeficiente = int("".join(map(str, digitos)) or "0")
    resultado = coeficiente * (10 ** (expoente + 2))
    return -resultado if sinal else resultado


def _dinheiro(centavos):
    return f"{centavos // 100}.{centavos % 100:02d}"


class Ledger:
    def __init__(self):
        self._saldos = {}
        self._eventos = {}

    @staticmethod
    def _validar(evento):
        if not isinstance(evento, dict): raise EventoInvalidoError("evento deve ser dict")
        tipo = evento.get("tipo")
        campos = {"deposito": {"id", "tipo", "conta", "valor"},
                  "saque": {"id", "tipo", "conta", "valor"},
                  "transferencia": {"id", "tipo", "origem", "destino", "valor"}}
        if not isinstance(tipo, str) or tipo not in campos or set(evento) != campos[tipo]:
            raise EventoInvalidoError("formato invalido")
        nomes = [evento["id"]] + ([evento["conta"]] if tipo != "transferencia" else [evento["origem"], evento["destino"]])
        if any(not isinstance(x, str) or not x for x in nomes): raise EventoInvalidoError("identificador invalido")
        if tipo == "transferencia" and evento["origem"] == evento["destino"]: raise EventoInvalidoError("contas iguais")
        texto = evento["valor"]
        if not isinstance(texto, str): raise EventoInvalidoError("valor invalido")
        if re.fullmatch(r"(0|[1-9][0-9]*)(\.[0-9]{1,2})?", texto) is None:
            raise EventoInvalidoError("valor invalido")
        valor = Decimal(texto)
        if valor == 0: raise EventoInvalidoError("valor invalido")
        return tipo, _centavos(valor)

    def aplicar(self, evento):
        if isinstance(evento, dict) and isinstance(evento.get("id"), str) and evento.get("id"):
            eid = evento["id"]
            if eid in self._eventos:
                if self._eventos[eid] == evento: return False
                raise EventoConflitanteError("id conflitante")
        tipo, valor = self._validar(evento)
        eid = evento["id"]
        if tipo == "deposito":
            conta = evento["conta"]; self._saldos[conta] = self._saldos.get(conta, 0) + valor
        elif tipo == "saque":
            conta = evento["conta"]
            if self._saldos.get(conta, 0) < valor: raise SaldoInsuficienteError("saldo insuficiente")
            self._saldos[conta] -= valor
        else:
            origem, destino = evento["origem"], evento["destino"]
            if self._saldos.get(origem, 0) < valor: raise SaldoInsuficienteError("saldo insuficiente")
            self._saldos[origem] -= valor
            self._saldos[destino] = self._saldos.get(destino, 0) + valor
        self._eventos[eid] = dict(evento)
        return True

    def aplicar_lote(self, eventos):
        if not isinstance(eventos, list): raise EventoInvalidoError("lote deve ser lista")
        saldos, aceitos = dict(self._saldos), dict(self._eventos)
        try: return sum(self.aplicar(evento) for evento in eventos)
        except Exception:
            self._saldos, self._eventos = saldos, aceitos
            raise

    def saldo(self, conta):
        if not isinstance(conta, str) or not conta: raise ValueError("conta invalida")
        return _dinheiro(self._saldos.get(conta, 0))

    def saldos(self):
        return {conta: _dinheiro(self._saldos[conta]) for conta in sorted(self._saldos)}

    @classmethod
    def replay(cls, eventos):
        ledger = cls(); ledger.aplicar_lote(eventos); return ledger
PY
